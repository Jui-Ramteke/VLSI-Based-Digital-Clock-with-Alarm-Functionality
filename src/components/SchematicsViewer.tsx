// =============================================================================
// Component Name: SchematicsViewer
// Description:    Interactive RTL Schematic block diagram.
//                 Draws connection buses between major clock subcomponents.
//                 Clicking blocks shows adjacent synthesizable Verilog code snippets.
// =============================================================================

import React, { useState } from 'react';
import { Layers, HelpCircle, Code, Info, ArrowRight } from 'lucide-react';
import { SimState, ClockState } from '../vlsiclock/clock_engine';

interface SchematicsViewerProps {
  state: SimState;
}

interface SchemaBlock {
  id: string;
  name: string;
  description: string;
  verilogCode: string;
  inputs: string[];
  outputs: string[];
}

export const SchematicsViewer: React.FC<SchematicsViewerProps> = ({ state }) => {
  const [selectedBlockId, setSelectedBlockId] = useState<string>('master_time');

  // Define schematic blocks in logical pipeline
  const blocks: SchemaBlock[] = [
    {
      id: "input_pads",
      name: "ASYNC BUTTONS & PADS",
      description: "External asynchronous physical inputs (push-buttons and switches). As standard FPGA buttons are asynchronous to the internal logic clock, they are highly prone to bouncing and bringing metastability into the master clock domain.",
      inputs: ["Physical Buttons", "Slide Switches"],
      outputs: ["btn_mode", "btn_inc", "btn_snooze", "sw_12_24", "sw_alarm_en"],
      verilogCode: `// Pin Mapping inside constraints (XDC file)
set_property PACKAGE_PIN W19 [get_ports btn_mode]
set_property PACKAGE_PIN T18 [get_ports btn_inc]
set_property PACKAGE_PIN U18 [get_ports btn_snooze]
set_property PACKAGE_PIN V17 [get_ports sw_12_24]
set_property PACKAGE_PIN V16 [get_ports sw_alarm_en]`
    },
    {
      id: "debouncers",
      name: "D-FF SYNCHRONIZERS & DEBOUNCERS",
      description: "Integrates a 2-stage Flip-Flop Synchronizer to protect against metastability, followed by a saturated clock integration counter. This filters noisy bounces of mechanical keys into stable single-clock cycle pulses.",
      inputs: ["btn_in", "clk", "rst_n"],
      outputs: ["btn_pulse (single-cycle trigger)"],
      verilogCode: `// 1. Two-Stage D Flip-Flop Synchronizer (Metastability block)
always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        sync_reg1 <= 1'b0; sync_reg2 <= 1'b0;
    end else begin
        sync_reg1 <= btn_in;
        sync_reg2 <= sync_reg1;
    end
end
// 2. Integration filter (checks button stability for N cycles)
if (btn_synced != btn_state) begin
    count_reg <= count_reg + 1;
    if (count_reg >= DEBOUNCE_COUNTS) btn_state <= btn_synced;
end`
    },
    {
      id: "fsm_ctrl",
      name: "MODE STATE MACHINE (FSM)",
      description: "Operates as a Mealy-type Finite State Machine driving clock setup configurations. Triggers state leaps between NORMAL, SET_HH, SET_MM, ALARM_HH, and ALARM_MM upon buttons clock-pulsing.",
      inputs: ["btn_mode_pulse", "btn_alarm_set_pulse"],
      outputs: ["current_state[2:0]", "blink_mask[5:0]"],
      verilogCode: `// Sequential state update
always @(posedge clk or negedge rst_n) begin
    if (!rst_n) current_state <= STATE_NORMAL;
    else        current_state <= next_state;
end
// State transitions
always @(*) begin
    next_state = current_state;
    case (current_state)
        STATE_NORMAL: if (btn_mode_pulse) next_state = STATE_SET_HH;
                      else if (btn_alarm_set_pulse) next_state = STATE_ALARM_HH;
        // transitions...
    endcase
end`
    },
    {
      id: "master_time",
      name: "24-HOUR TIMEKEEPING COUNTERS",
      description: "Maintains seconds, minutes, and hours registers. Rollovers from 59 seconds to minutes, and 59 minutes to hours. Halts normal countdown increments during manual programming so seconds reset clean.",
      inputs: ["clk", "rst_n", "one_sec_tick", "btn_inc_pulse (from SET mode)"],
      outputs: ["reg_seconds[5:0]", "reg_minutes[5:0]", "reg_hours[5:0]"],
      verilogCode: `// Timekeeper Increments / Rollovers
always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        reg_hours <= 12; reg_minutes <= 0; reg_seconds <= 0;
    end else begin
        if (current_state == STATE_SET_HH) begin
             if (btn_inc_pulse) reg_hours <= (reg_hours + 1) % 24;
        end else if (one_sec_tick) begin
             if (reg_seconds >= 59) begin
                  reg_seconds <= 0;
                  if (reg_minutes >= 59) begin
                       reg_minutes <= 0;
                       reg_hours <= (reg_hours + 1) % 24;
                  end else reg_minutes <= reg_minutes + 1;
             end else reg_seconds <= reg_seconds + 1;
        end
    end
end`
    },
    {
      id: "alarm_comp",
      name: "ALARM COMPARATOR & SNOOZE LATCH",
      description: "Matches timekeepers continuously against saved alarm registers. If armed and equal, drives buzzer active-high. Presetting the physical snooze button clears buzzer and loads alarm snooze counter +5 minutes forwards.",
      inputs: ["reg_hours", "reg_minutes", "alarm_hours", "alarm_minutes", "btn_snooze_pulse", "sw_alarm_en"],
      outputs: ["buzzer", "led_alarm_armed"],
      verilogCode: `// Comparator equality triggers Alarm Active State
always @(posedge clk or negedge rst_n) begin
    if (!rst_n) alarm_ringing <= 1'b0;
    else if (!sw_alarm_en) alarm_ringing <= 1'b0;
    else begin
        if (reg_hours == alarm_hours && reg_minutes == alarm_minutes && reg_seconds == 0 && !snooze_armed) begin
            alarm_ringing <= 1'b1;
        end
        // Snooze re-alarm schedule
        if (alarm_ringing && btn_snooze_pulse) begin
            alarm_ringing <= 1'b0;
            snooze_armed <= 1'b1;
            snooze_trigger_min <= (reg_minutes + 5) % 60;
        end
    end
end`
    },
    {
      id: "display_routing",
      name: "12/24 FORMATTER & INTERFACE SELECT",
      description: "Formats 24-hr layout counts into 12-hr AM/PM index boundaries if selected. Routes active data lines: displays running time on segments normally, or redirects alarm registers to the display during alarm-set modes.",
      inputs: ["sw_12_24", "current_state", "reg_hours", "alarm_hours"],
      outputs: ["hours_to_display[4:0]", "displaying_alarm_flag", "led_pm"],
      verilogCode: `// Interface Routing & 12-Hour conversion
always @(*) begin
    led_pm = 1'b0;
    if (sw_12_24 == 1'b0) begin // 12-Hour
        if (raw_hours_mux >= 12) led_pm = 1'b1;
        if (raw_hours_mux == 0)      hours_to_display = 12;
        else if (raw_hours_mux > 12) hours_to_display = raw_hours_mux - 12;
        else                         hours_to_display = raw_hours_mux;
    end else begin              // 24-Hour
        hours_to_display = raw_hours_mux;
    end
end`
    },
    {
      id: "mux_muxer",
      name: "7-SEGMENT SCANNING DIGITS MULTIPLEXER",
      description: "Generates active-low anode sweep pulses sequencing from Digit 5 to Digit 0. Muxes corresponding BCD digits to common cathode buses, and integrates the blinking duty masks for active manual setup registers.",
      inputs: ["hours_to_display", "minutes_to_display", "seconds_to_display", "blink_mask", "blink_tick", "clk"],
      outputs: ["an[5:0]", "seg[6:0]", "dp"],
      verilogCode: `// Multiplexer digit active scanning case (Anodes low)
always @(*) begin
    an = 6'b111111; // default off 
    case (digit_select)
        3'd5: begin 
            current_hex = hr_tens; 
            an = 6'b011111; // Enable digit 5 hours tens
            is_blinking = blink_mask[5] && blink_tick;
        end
        3'd4: begin 
            current_hex = hr_ones; 
            an = 6'b101111; // Enable digit 4 hours ones
            is_blinking = blink_mask[4] && blink_tick;
        end
        // ...Other digits scans...
    endcase
end`
    }
  ];

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || blocks[0];

  return (
    <div className="w-full bg-slate-950 border border-white/5 rounded-xl p-5 md:p-6 flex flex-col gap-5 relative overflow-hidden" id="schematics_viewer">
      
      {/* Schematics Header */}
      <div className="flex justify-between items-center pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-digital-green" />
          <h3 className="font-display font-bold text-white text-sm">Gate-Level RTL Schematics Flow</h3>
        </div>
        <span className="font-mono text-[9px] text-slate-500">YOSYS HIGH LEVEL GRAPH REPRESENTATION</span>
      </div>

      {/* Grid: Left layout maps interactive blocks chain, Right panel displays verilog mapping */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COMPILER FLOW (lg:col-span-5) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <span className="font-mono text-[9.5px] text-slate-400 uppercase tracking-widest font-semibold mb-1">
            Structural Interconnections
          </span>

          {blocks.map((bl, bIdx) => {
            const isSelected = bl.id === selectedBlockId;
            return (
              <div key={bl.id} className="relative flex flex-col items-center">
                
                {/* RTL Block */}
                <button
                  onClick={() => setSelectedBlockId(bl.id)}
                  className={`w-full text-left p-3.5 rounded-lg border transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'bg-digital-green/10 border-digital-green shadow-[inset_0_1px_1px_rgba(16,185,129,0.15)] shadow-glow-green/10'
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                  }`}
                  id={`schem_block_${bl.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`font-mono text-[8.5px] ${isSelected ? 'text-digital-green' : 'text-slate-500'} font-bold`}>
                        {`U_BLOCK_0${bIdx + 1}`}
                      </span>
                      <h4 className="font-display font-medium text-xs text-white leading-tight mt-0.5 group-hover:text-digital-green transition-colors">
                        {bl.name}
                      </h4>
                    </div>
                  </div>

                  {/* Highlighting wire details */}
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[8px]">
                    <span className="text-slate-500">I: <span className="text-slate-400">{bl.inputs.slice(0, 2).join(', ')}</span></span>
                    <span className="text-slate-500">O: <span className="text-digital-amber">{bl.outputs.slice(0, 2).join(', ')}</span></span>
                  </div>

                  {/* Active highlight dot */}
                  {isSelected && (
                    <div className="absolute right-3.5 top-3.5 w-1.5 h-1.5 rounded-full bg-digital-green animate-ping"></div>
                  )}
                </button>

                {/* Arrow down between blocks except last */}
                {bIdx < blocks.length - 1 && (
                  <div className="h-4 w-[2px] bg-slate-800 relative z-10 flex justify-center">
                    <ArrowRight className="w-2.5 h-2.5 rotate-90 text-slate-600 absolute -top-1" />
                  </div>
                )}

              </div>
            );
          })}
        </div>

        {/* RIGHT CODE MUX PANEL (lg:col-span-7) */}
        <div className="lg:col-span-7 flex flex-col gap-4 bg-slate-900/20 border border-white/5 rounded-xl p-5 h-full min-h-[400px]">
          
          {/* Header */}
          <div className="flex justify-between items-center border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-digital-green" />
              <span className="font-mono text-[10px] text-slate-300 font-bold uppercase">{selectedBlock.id}.v Synthesizable HDL</span>
            </div>
          </div>

          {/* Description Block */}
          <div className="flex flex-col gap-1 text-slate-300">
            <h5 className="font-display font-semibold text-white text-xs">{selectedBlock.name}</h5>
            <p className="font-sans text-[11.5px] text-slate-400 leading-normal">{selectedBlock.description}</p>
          </div>

          <div className="flex flex-col gap-1.5 border border-white/5 rounded-lg p-3 bg-slate-950 font-mono text-[9.5px]">
            <span className="text-slate-500 text-[8px] uppercase tracking-wider font-semibold">Port list values:</span>
            <div className="grid grid-cols-2 gap-2 text-slate-400">
              <div>
                <span className="text-blue-400">INPUTS:</span>
                <ul className="list-disc pl-4 mt-1 flex flex-col gap-0.5 text-slate-300">
                  {selectedBlock.inputs.map((inp, idx) => (
                    <li key={`inp-${idx}`}>
                      {inp} {inp.includes('clk') ? `(${state.clk_tick_count % 2 === 0 ? 'H' : 'L'})` : inp.includes('rst_n') ? `(${state.rst_n ? '1' : '0'})` : inp.includes('mode') ? `(${state.btn_mode_raw ? '1' : '0'})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="text-digital-amber">OUTPUTS:</span>
                <ul className="list-disc pl-4 mt-1 flex flex-col gap-0.5 text-slate-300">
                  {selectedBlock.outputs.map((out, idx) => (
                    <li key={`out-${idx}`}>
                      {out} {out.includes('buzzer') ? `(${state.buzzer ? '1/ON' : '0/OFF'})` : out.includes('current_state') ? `(STATE_0${state.current_state})` : out.includes('led_alarm') ? `(${state.led_alarm_armed ? '1' : '0'})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Code Viewer Panel */}
          <div className="flex-1 flex flex-col gap-2 rounded-lg overflow-hidden border border-white/5">
            <div className="bg-slate-950/80 px-3 py-1.5 border-b border-white/5 flex items-center justify-between text-[9px] font-mono text-slate-500">
              <span>VERILOG SYNTAX PORTION</span>
              <span className="text-digital-green">Synthesizable</span>
            </div>
            <pre className="p-3 bg-slate-950 font-mono text-[9px] overflow-x-auto text-slate-300 leading-relaxed max-h-60 overflow-y-auto">
              <code>{selectedBlock.verilogCode}</code>
            </pre>
          </div>

          {/* Synthesis Stats */}
          <div className="text-[10px] font-mono p-2.5 bg-slate-950/30 border border-white/5 rounded-lg text-slate-500 flex justify-between">
            <span>Cell Library Target: <strong>YOSYS GENERIC</strong></span>
            <span>Total Block Gates Equivalent: <strong>~{selectedBlockId === 'input_pads' ? '16' : selectedBlockId === 'debouncers' ? '128' : '256'} gates</strong></span>
          </div>

        </div>

      </div>

    </div>
  );
};
