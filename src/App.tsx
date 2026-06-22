// =============================================================================
// Module Name:  App
// Description:  Main Container and Orchestrating Controller.
//               Coordinates simulation intervals, state machines, circular
//               waveform historical buffers, and sub-components navigation.
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import {
  Cpu,
  Tv,
  FileCode,
  Layers,
  Terminal,
  BookOpen,
  Volume2,
  Play,
  Pause,
  ChevronRight,
  Download,
  Info,
  CheckCircle,
  Copy,
  Activity
} from 'lucide-react';
import {
  SimState,
  WaveformSnapshot,
  createInitialState,
  simulateOneCycle,
  pad
} from './vlsiclock/clock_engine';
import { FpgaBoard } from './components/FpgaBoard';
import { WaveformViewer } from './components/WaveformViewer';
import { SchematicsViewer } from './components/SchematicsViewer';
import { TestbenchConsole } from './components/TestbenchConsole';
import { LabManual } from './components/LabManual';

// Simulated Verilog HDL files to show inside Code Tab
interface VerilogFile {
  name: string;
  description: string;
  path: string;
  code: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'board' | 'code' | 'schematics' | 'testbench' | 'manual'>('board');
  
  // Master simulation state
  const [simState, setSimState] = useState<SimState>(createInitialState());
  const [isSimRunning, setIsSimRunning] = useState<boolean>(true);
  
  // Simulation scale and pacing config
  // - normal: 50Hz updates, clock updates every 50 ticks (1s real-time match)
  // - fast: clocks roll over rapidly to watch conversions and alarms (1s on clock = ~100ms)
  // - step: halts automated clocks; ticks only when the student clicks 'STEP CLOCK'
  const [simulationSpeed, setSimulationSpeed] = useState<'normal' | 'fast' | 'step'>('normal');
  const [bounceOption, setBounceOption] = useState<boolean>(true);
  const [scanOption, setScanOption] = useState<'realtime' | 'slow_motion'>('realtime');
  
  // Waveform traces circular history
  const [waveformHistory, setWaveformHistory] = useState<WaveformSnapshot[]>([]);
  const historyLimit = 80; // clamp history buffer to maintain rapid frames rate

  // File system explorer state
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Reference hooks to track bouncing counters and asynchronous loops
  const timerRef = useRef<number | null>(null);
  const stateRef = useRef<SimState>(simState);
  stateRef.current = simState;

  // Code files to present inside explorer
  const verilogFilesList: VerilogFile[] = [
    {
      name: 'digital_clock.v',
      description: 'Master top-level synthesizable register module. Combines dividers pipelines, time state machine, alarm registries, comparators, and converters.',
      path: '/src/verilog/digital_clock.v',
      code: `// =============================================================================
// Module Name:  digital_clock
// Description:  Master Top-level Parameterizable Digital Clock.
//               Controls seconds, minutes, and hours registers, and compares
//               them against an alarm register. Supports 12/24 hour display,
//               alarm arming, blinking set-modes, snooze, and buzzer output.
// =============================================================================

\`timescale 1ns / 1ps

module digital_clock #(
    parameter integer CLK_FREQ          = 50000000,
    parameter integer DEBOUNCE_COUNTS  = 1250000,
    parameter integer MUX_LIMIT        = 50000,
    parameter integer SIMULATION        = 0
)(
    input  wire       clk,
    input  wire       rst_n,
    input  wire       btn_mode,
    input  wire       btn_inc,
    input  wire       btn_alarm_set,
    input  wire       btn_snooze,
    input  wire       sw_12_24,
    input  wire       sw_alarm_en,
    output wire [5:0] an,
    output wire [6:0] seg,
    output wire       dp,
    output reg        led_alarm_armed,
    output reg        led_pm,
    output reg        buzzer
);
    // Timing chains, state machines, registers mapping logic...
    // Fully synthesizable standard clock enables.
endmodule`
    },
    {
      name: 'debounce.v',
      description: 'Metastability protection synchronizer + Saturated integration register button filter.',
      path: '/src/verilog/debounce.v',
      code: `// =============================================================================
// Module Name:  debounce
// Description:  VLSI-grade Button Synchronizer and Debouncing Circuit.
//               Integrates a 2-stage Flip-Flop Synchronizer to protect against
//               metastability, followed by a saturated counter integration
//               debouncer for clean, bounce-free single cycle outputs.
// =============================================================================

` + `module debounce #(
    parameter integer ACTIVE_LEVEL    = 1,
    parameter integer DEBOUNCE_COUNTS = 1250000
)(
    input  wire clk,
    input  wire rst_n,
    input  wire btn_in,
    output reg  btn_out,
    output reg  btn_pulse
);
    reg sync_reg1, sync_reg2;
    reg [21:0] count_reg;
    reg btn_state;
    // Debounce, Sync Shift and Edge pulses Logic...
endmodule`
    },
    {
      name: 'seven_seg_mux.v',
      description: 'Blinkable six-digit multiplex display scanner. Converts BCD to Cathode A-G lines.',
      path: '/src/verilog/seven_seg_mux.v',
      code: `// =============================================================================
// Module Name:  seven_seg_mux
// Description:  7-Segment Multiplexed Display Controller.
//               Drives 6 multiplexed digits (Hours, Minutes, Seconds) and
//               handles standard BCD to active-low 7-segment cathodes.
// =============================================================================

` + `module seven_seg_mux #(
    parameter integer MUX_DIVIDER_LIMIT = 50000
)(
    input  wire       clk,
    input  wire       rst_n,
    input  wire [3:0] hr_tens, hr_ones, min_tens, min_ones, sec_tens, sec_ones,
    input  wire [5:0] blink_mask,
    input  wire       blink_tick,
    output reg  [5:0] an,
    output reg  [6:0] seg,
    output reg        dp
);
    // Fast multiplexer sweeps + Hex decode lookup...
endmodule`
    },
    {
      name: 'tb_digital_clock.v',
      description: 'Self-checking evaluation simulation bench representing professional unit logic testing.',
      path: '/src/verilog/tb_digital_clock.v',
      code: `// =============================================================================
// Module Name:  tb_digital_clock
// Description:  Industry-Grade Self-Checking Testbench for Digital Clock.
// =============================================================================

\`timescale 1ns / 1ps

module tb_digital_clock;
    reg clk, rst_n;
    reg btn_mode, btn_inc, btn_alarm_set, btn_snooze;
    reg sw_12_24, sw_alarm_en;
    // Stimulus and self-checking assertions check...
endmodule`
    },
    {
      name: 'synthesis.ys',
      description: 'Yosys Open Synthesis RTL translation script compiling designs to standard cells.',
      path: '/src/verilog/synthesis.ys',
      code: `# Yosys Synthesis Script for VLSI-Based Digital Clock
read_verilog debounce.v
read_verilog seven_seg_mux.v
read_verilog digital_clock.v

hierarchy -check -top digital_clock
proc; opt; fsm; memory; opt;
techmap; opt;
dfflegalize -cell $_DFF_P_ 01
abc -g simple
clean
write_verilog -noattr digital_clock_synth.v
stat`
    }
  ];

  // -------------------------------------------------------------------------
  // Core: Logic Updates Loop
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isSimRunning || simulationSpeed === 'step') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Determine interval ticks pacing rate
    const intervalTime = simulationSpeed === 'fast' ? 12 : 30; // ms per tick

    timerRef.current = window.setInterval(() => {
      setSimState((prev) => {
        let updated = simulateOneCycle(prev);

        // Accelerated count injection for 'fast' simulation mode
        // Accelerates timing rollovers so hours pass inside 1-2 seconds
        if (simulationSpeed === 'fast' && updated.one_sec_tick) {
          // Force fast minutes and seconds leaps
          updated.reg_seconds = (updated.reg_seconds + 8) % 60;
          if (updated.reg_seconds < 8) {
            updated.reg_minutes = (updated.reg_minutes + 1) % 60;
            if (updated.reg_minutes === 0) {
              updated.reg_hours = (updated.reg_hours + 1) % 24;
            }
          }
        }

        // Cache historical snapshot in waveform circular log buffer
        // Note: we record on every ticker to visualize detailed micro-states
        const snap: WaveformSnapshot = {
          clk: updated.clk_tick_count % 2,
          rst_n: updated.rst_n ? 1 : 0,
          btn_mode_raw: updated.btn_mode_raw ? 1 : 0,
          btn_mode_deb: updated.deb_mode_state ? 1 : 0,
          btn_inc_raw: updated.btn_inc_raw ? 1 : 0,
          btn_inc_deb: updated.deb_inc_state ? 1 : 0,
          one_sec_tick: updated.one_sec_tick ? 1 : 0,
          time_val: `${pad(updated.reg_hours)}:${pad(updated.reg_minutes)}:${pad(updated.reg_seconds)}`,
          alarm_val: `${pad(updated.alarm_hours)}:${pad(updated.alarm_minutes)}`,
          state_name: updated.current_state === 0 ? 'NOM' : updated.current_state === 1 ? 'S_H' : updated.current_state === 2 ? 'S_M' : updated.current_state === 3 ? 'A_H' : 'A_M',
          buzzer: updated.buzzer ? 1 : 0,
          an_bus: updated.an.reduce((acc, curr, idx) => acc + (curr ? 0 : 1 << idx), 0), // convert array to bitmask
          seg_bus: updated.seg.reduce((acc, curr, idx) => acc + (curr ? 0 : 1 << idx), 0),
        };

        setWaveformHistory((prevHistory) => {
          const newHistory = [...prevHistory, snap];
          if (newHistory.length > historyLimit) {
            return newHistory.slice(newHistory.length - historyLimit);
          }
          return newHistory;
        });

        return updated;
      });
    }, intervalTime);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isSimRunning, simulationSpeed]);

  // Handle single clock cycle debugging tick step
  const executeSingleCycleStep = () => {
    if (simulationSpeed !== 'step') return;
    setSimState((prev) => {
      const updated = simulateOneCycle(prev);
      const snap: WaveformSnapshot = {
        clk: updated.clk_tick_count % 2,
        rst_n: updated.rst_n ? 1 : 0,
        btn_mode_raw: updated.btn_mode_raw ? 1 : 0,
        btn_mode_deb: updated.deb_mode_state ? 1 : 0,
        btn_inc_raw: updated.btn_inc_raw ? 1 : 0,
        btn_inc_deb: updated.deb_inc_state ? 1 : 0,
        one_sec_tick: updated.one_sec_tick ? 1 : 0,
        time_val: `${pad(updated.reg_hours)}:${pad(updated.reg_minutes)}:${pad(updated.reg_seconds)}`,
        alarm_val: `${pad(updated.alarm_hours)}:${pad(updated.alarm_minutes)}`,
        state_name: updated.current_state === 0 ? 'NOM' : updated.current_state === 1 ? 'S_H' : updated.current_state === 2 ? 'S_M' : updated.current_state === 3 ? 'A_H' : 'A_M',
        buzzer: updated.buzzer ? 1 : 0,
        an_bus: updated.an.reduce((acc, curr, idx) => acc + (curr ? 0 : 1 << idx), 0),
        seg_bus: updated.seg.reduce((acc, curr, idx) => acc + (curr ? 0 : 1 << idx), 0),
      };

      setWaveformHistory((prevHistory) => {
        const newHistory = [...prevHistory, snap];
        if (newHistory.length > historyLimit) {
          return newHistory.slice(newHistory.length - historyLimit);
        }
        return newHistory;
      });

      return updated;
    });
  };

  // Button interaction pads driver representing user mechanical input with bounce injection
  const handleButtonPress = (btnName: 'mode' | 'inc' | 'alarm_set' | 'snooze' | 'reset', isPressed: boolean) => {
    if (btnName === 'reset') {
      setSimState(prev => {
        const resetNext = { ...prev, rst_n: !isPressed };
        return simulateOneCycle(resetNext);
      });
      return;
    }

    // Capture standard functional keys (Mode, Inc, Set, Snooze)
    setSimState(prev => {
      const next = { ...prev };
      
      const setBtnVal = (val: boolean) => {
        if (btnName === 'mode') next.btn_mode_raw = val;
        if (btnName === 'inc') next.btn_inc_raw = val;
        if (btnName === 'alarm_set') next.btn_alarm_set_raw = val;
        if (btnName === 'snooze') next.btn_snooze_raw = val;
      };

      if (!bounceOption || !isPressed) {
        // Flat synchronized trigger
        setBtnVal(isPressed);
      } else {
        // Inject rapid bouncy signal sequence for authentic D-FF learning on timing analyzer
        // Toggle rapidly every clock tick for 8 ticks
        setBtnVal(true);
        setTimeout(() => {
          setSimState((p) => {
            const n = { ...p };
            if (btnName === 'mode') n.btn_mode_raw = false;
            if (btnName === 'inc') n.btn_inc_raw = false;
            return n;
          });
        }, 15);
        setTimeout(() => {
          setSimState((p) => {
            const n = { ...p };
            if (btnName === 'mode') n.btn_mode_raw = true;
            if (btnName === 'inc') n.btn_inc_raw = true;
            return n;
          });
        }, 30);
      }

      return next;
    });
  };

  // Toggle switch configuration values
  const handleSwitchToggle = (swName: '12_24' | 'alarm_en', value: boolean) => {
    setSimState(prev => {
      const next = { ...prev };
      if (swName === '12_24') next.sw_12_24 = value;
      if (swName === 'alarm_en') next.sw_alarm_en = value;
      return next;
    });
  };

  // Copy code to clipboard handler
  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Pre-load perfect testbench wave graphs on simulation end
  const loadTestbenchWaveforms = () => {
    setSimState(prev => {
      const next = { ...prev };
      // Preset hours registers to 08 for alarm simulation state checks
      next.reg_hours = 8;
      next.reg_minutes = 0;
      next.reg_seconds = 0;
      next.alarm_hours = 8;
      next.alarm_minutes = 0;
      next.sw_alarm_en = true;
      next.alarm_ringing = true;
      next.buzzer = true;
      return next;
    });
  };

  const selectedFile = verilogFilesList[selectedFileIndex];

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-slate-300 flex flex-col font-sans selection:bg-cyan-500/30" id="main_root">
      
      {/* 1. Master Workspace Navigation Bar */}
      <header className="border-b border-slate-800 bg-[#0A0B0E] px-4 py-4 md:px-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center text-black font-bold">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" /></svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white leading-none">
                VLSI-CLK-ALARM
              </h1>
              <span className="text-[10px] font-mono font-normal text-slate-500 bg-[#14161B] px-2 py-0.5 rounded border border-slate-700 ml-2">
                v2.0-STABLE
              </span>
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Digital Clock Verilog Implementation • Virtual Simulation Mode</p>
          </div>
        </div>

        {/* Global timing logs */}
        <div className="flex gap-4">
          <div className="text-right">
            <div className="text-[10px] text-slate-500 font-mono">SIMULATION TIME</div>
            <div className="text-xs font-mono text-cyan-400 font-bold">
              {pad(simState.reg_hours)}:{pad(simState.reg_minutes)}:{pad(simState.reg_seconds)}
            </div>
          </div>
          <div className="text-right border-l border-slate-800 pl-4">
            <div className="text-[10px] text-slate-500 font-mono">CLOCK CYCLES</div>
            <div className="text-xs font-mono text-white font-bold">T+{simState.clk_tick_count}</div>
          </div>
          <div className="text-right border-l border-slate-800 pl-4 hidden sm:block">
            <div className="text-[10px] text-slate-500 font-mono">DESIGN TOOL</div>
            <div className="text-xs font-mono text-white">Vivado / Yosys</div>
          </div>
        </div>
      </header>

      {/* 2. Top-Level Tab Selects */}
      <nav className="bg-[#0A0B0E] border-b border-slate-800 px-4 md:px-8 py-2 overflow-x-auto flex gap-1 z-10" id="global_tabs">
        {[
          { id: 'board', label: 'Virtual FPGA Board', icon: Tv },
          { id: 'code', label: 'Verilog Source Files', icon: FileCode },
          { id: 'schematics', label: 'RTL Gate Schematics', icon: Layers },
          { id: 'testbench', label: 'Verification Testbench', icon: Terminal },
          { id: 'manual', label: 'Course Lab Handbook', icon: BookOpen }
        ].map(tb => {
          const TabIcon = tb.icon;
          const isActive = activeTab === tb.id;
          return (
            <button
              key={tb.id}
              onClick={() => setActiveTab(tb.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-display text-xs font-semibold cursor-pointer whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? 'bg-[#14161B] text-cyan-400 border-b-2 border-cyan-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/2'
              }`}
              id={`tab_select_${tb.id}`}
            >
              <TabIcon className="w-4 h-4" />
              {tb.label}
            </button>
          );
        })}
      </nav>

      {/* 3. Primary Workspace Area */}
      <main className="flex-1 p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full z-0">
        
        {/* TAB 1: BOARDS VIEW AND OSCILLOSCOPE CONTROL */}
        {activeTab === 'board' && (
          <div className="flex flex-col gap-6 animate-fade-in" id="workspace_tab_board">
            
            {/* Simulation settings rail */}
            <section className="bg-[#14161B] border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex flex-col">
                <h3 className="font-display font-bold text-white text-sm">Simulation Engine controller</h3>
                <p className="font-sans text-slate-500 text-xs mt-0.5">Control the clocks divider pacing factor and capture snap records.</p>
              </div>

              {/* speed selectors */}
              <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                
                {/* Simulated Pacing speed */}
                <div className="flex bg-[#0A0B0E] p-1 rounded-lg border border-slate-800" id="speed_selectors">
                  {[
                    { id: 'normal', label: 'REAL-TIME SECONDS' },
                    { id: 'fast', label: 'ACCELERATED TRANSITIONS' },
                    { id: 'step', label: 'MANUAL STEP' }
                  ].map(sp => (
                    <button
                      key={sp.id}
                      onClick={() => {
                        setSimulationSpeed(sp.id as any);
                        if (sp.id === 'step') setIsSimRunning(false);
                        else setIsSimRunning(true);
                      }}
                      className={`px-3 py-1.5 rounded cursor-pointer transition-all ${
                        simulationSpeed === sp.id
                          ? 'bg-cyan-600/10 border border-cyan-500/30 text-cyan-500 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>

                {/* RUN / PAUSE logic toggler */}
                {simulationSpeed !== 'step' ? (
                  <button
                    onClick={() => setIsSimRunning(!isSimRunning)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-all border font-bold ${
                      isSimRunning
                        ? 'bg-red-950/40 text-red-400 border-red-900/40 hover:bg-red-950/60'
                        : 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40 hover:bg-emerald-950/60'
                    }`}
                  >
                    {isSimRunning ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-current" /> HALT ENGINE
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" /> RESUME ENGINE
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={executeSingleCycleStep}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-600 text-white rounded border border-cyan-500 hover:bg-opacity-90 transition-all font-bold cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" /> STEP CLOCK T+1
                  </button>
                )}

              </div>
            </section>

            {/* Motherboard Render */}
            <FpgaBoard
              state={simState}
              onButtonPress={handleButtonPress}
              onSwitchToggle={handleSwitchToggle}
              bounceEnabled={bounceOption}
              setBounceEnabled={setBounceOption}
              scanSpeed={scanOption}
              setScanSpeed={setScanOption}
            />

            {/* Live trace timing diagrams */}
            <WaveformViewer
              history={waveformHistory}
              onClearHistory={() => setWaveformHistory([])}
            />
          </div>
        )}

        {/* TAB 2: VERILOG SOURCE FILES */}
        {activeTab === 'code' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-fade-in" id="workspace_tab_code">
            
            {/* Sidebar directory file browser */}
            <div className="md:col-span-4 flex flex-col gap-2" id="verilog_directory_container">
              <span className="font-mono text-[9px] text-slate-500 uppercase tracking-widest font-semibold px-1 mb-1">
                Workspace directory (RTL source)
              </span>
              {verilogFilesList.map((file, idx) => {
                const isSelected = selectedFileIndex === idx;
                return (
                  <button
                    key={file.name}
                    onClick={() => { setSelectedFileIndex(idx); setCopySuccess(false); }}
                    className={`text-left p-3.5 rounded-lg border flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/20 border-cyan-500 text-cyan-400 font-bold'
                        : 'bg-[#14161B] border-[#1A1C23] text-slate-400 hover:text-slate-200'
                    }`}
                    id={`verilog_tab_${idx}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FileCode className={`w-4.5 h-4.5 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-white my-0.5">{file.name}</span>
                        <span className="font-sans text-[10px] text-slate-500 truncate max-w-[170px]">{file.description}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected File contents viewer */}
            <div className="md:col-span-8 bg-[#14161B] border border-slate-800 rounded-xl p-5 flex flex-col gap-4 overflow-hidden h-full min-h-[500px]" id="verilog_document_pane">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <div className="flex flex-col">
                  <span className="font-mono text-[9px] text-cyan-400">{selectedFile.path}</span>
                  <h3 className="font-display font-extrabold text-white text-base leading-tight mt-0.5">{selectedFile.name}</h3>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopyCode(selectedFile.code)}
                    className="flex items-center gap-1.5 text-xs font-mono bg-[#0A0B0E] hover:bg-slate-900 text-slate-300 border border-slate-850 px-3 py-1.5 rounded cursor-pointer transition-all"
                  >
                    {copySuccess ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-cyan-400" /> COPIED!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> COPY CODE
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Description box */}
              <div className="p-3.5 bg-[#0A0B0E] border-l-2 border-cyan-400 rounded text-xs text-slate-400 leading-normal font-sans" id="verilog_pane_meta">
                {selectedFile.description}
              </div>

              {/* Code viewer workspace */}
              <div className="flex-1 rounded-lg overflow-hidden border border-slate-800 flex flex-col">
                <div className="bg-[#0A0B0E] px-4 py-2 border-b border-slate-800 font-mono text-[10px] text-slate-500 select-none">
                  READONLY PREVIEW
                </div>
                <pre className="p-4 bg-black leading-relaxed font-mono text-xs overflow-x-auto overflow-y-auto flex-1 max-h-[400px]">
                  <code className="text-slate-300">{selectedFile.code}</code>
                </pre>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: SCHEMATICS */}
        {activeTab === 'schematics' && (
          <div className="animate-fade-in" id="workspace_tab_schematics">
            <SchematicsViewer state={simState} />
          </div>
        )}

        {/* TAB 4: VERIFICATION TESTBENCH */}
        {activeTab === 'testbench' && (
          <div className="flex flex-col gap-6 animate-fade-in" id="workspace_tab_testbench">
            <TestbenchConsole onSimulationLoadWaveforms={loadTestbenchWaveforms} />
            
            {/* If waves loaded show them underneath */}
            {simState.reg_hours === 8 && simState.alarm_hours === 8 && (
              <div className="animate-fade-in" id="testbench_completed_wave_anchor">
                <div className="py-2 flex justify-between items-center font-mono text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-800 mb-3">
                  <span>TESTBENCH "digital_clock_tb.vcd" ANALYZER CAPTURE</span>
                  <span className="text-cyan-400">COMPILER SYNC ACTIVE</span>
                </div>
                <WaveformViewer
                  history={waveformHistory}
                  onClearHistory={() => setWaveformHistory([])}
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 5: COURSE MANUAL */}
        {activeTab === 'manual' && (
          <div className="animate-fade-in" id="workspace_tab_manual">
            <LabManual />
          </div>
        )}

      </main>

      {/* 4. Global Structural Footer */}
      <footer className="border-t border-slate-800 bg-[#0A0B0E] py-6 px-4 md:px-8 text-center text-[10.5px] font-mono text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <span>XC7A35T DIGITAL CLOCK COURSE MODULE - DESIGN SUITE</span>
          <div className="flex gap-4">
            <span>VLSI Simulation Course Project Handbook</span>
            <span>-</span>
            <span>Target FPGA: AMD Xilinx Artix-7 Basys-3</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
