// =============================================================================
// Component Name: TestbenchConsole
// Description:    Simulated Linux EDA Console running Icarus Verilog compiler.
//                 Executes self-checking diagnostic logs itemized in
//                 tb_digital_clock.v with animated scrolling text print.
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Play, CheckCircle2, RefreshCw, Layers } from 'lucide-react';

interface TestbenchConsoleProps {
  onSimulationLoadWaveforms: () => void;
}

export const TestbenchConsole: React.FC<TestbenchConsoleProps> = ({ onSimulationLoadWaveforms }) => {
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [testPercent, setTestPercent] = useState<number>(0);
  const [hasRun, setHasRun] = useState<boolean>(false);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  // Full simulator standard output lines matching tb_digital_clock.v
  const simulationLogs = [
    'Parsing Verilog designs in active workspace...',
    '  - debounce.v (Syntax: OK, cell count: 48)',
    '  - seven_seg_mux.v (Syntax: OK, cell count: 124)',
    '  - digital_clock.v (Syntax: OK, cell count: 322)',
    '  - tb_digital_clock.v (Verilog-95 testbench environment: OK)',
    'Compiling modules with dependencies hierarchy...',
    '  $ iverilog -o digital_clock_sim debounce.v seven_seg_mux.v digital_clock.v tb_digital_clock.v',
    '  Compilation completed. Code bounds verified. Structural netlist ready.',
    'Executing binary simulation target with vvp engine...',
    '  $ vvp digital_clock_sim',
    '================================================================',
    '   STARTING TECHNICAL VERIFICATION TESTBENCH: VLSI DIGITAL CLOCK  ',
    '================================================================',
    '[TEST 1] Testing Asynchronous Active-Low Reset...',
    '  # Setting rst_n = 0 at T=5ns',
    '  # Releasing rst_n = 1 at T=45ns',
    '  [PASS] Master reset verified! Internal time default starts at 12:00:00.',
    '[TEST 2] Testing 12/24 Hour conversion state...',
    '  # Pulling sw_12_24 low to select 12-hour formatting',
    '  [PASS] 12-hour converter displays 12 AM for midnight/noon boundary correctly.',
    '[TEST 3] Simulating normal count rollover triggers...',
    '  # Pre-loading internal clock counters to 23:59:58',
    '  # Ticking clock divider enable lines for 2 seconds',
    '  [PASS] Full cycle midnight roll-over verified! (23:59:59 -> 00:00:00).',
    '[TEST 4] Simulating manual hour programming (SET_HH State)...',
    '  # Pulsing btn_mode high (transitions state machine to STATE_SET_HH)',
    '  [PASS] Transitioned to STATE_SET_HH successfully.',
    '  # Pulsing btn_inc twice to increment Hours counters',
    '  [PASS] Segment increments twice, counting hours register from 00 up to 02 successfully.',
    '[TEST 5] Testing Alarm Setup and Arming Comparator...',
    '  # Pulsing btn_alarm_set to enter STATE_ALARM_HH',
    '  # Pulsing btn_inc twice to shift alarm register hours: 06 -> 08',
    '  [PASS] Alarm Register hours successfully set to 08:00:00.',
    '[TEST 6] Simulating Time Match to ring Alarm Buzzer...',
    '  # Forcing time counters to match target alarm registers (08:00:00)',
    '  # Flipping sw_alarm_en to arm switch',
    '  [PASS] Alarm comparison matched! Buzzer output successfully activated (High).',
    '[TEST 7] Testing Snooze active silence and rescheduling logic...',
    '  # Pulsing btn_snooze to initiate snooze condition',
    '  [PASS] Snooze successfully quieted buzzer and rescheduled trigger time to 08:05:00.',
    '================================================================',
    '   TESTBENCH PASSED: VLSI DIGITAL CLOCK SYSTEM INTEGRITY OK!   ',
    '   Total errors encountered: 0',
    '================================================================',
    'Dumping waveform metrics database file "digital_clock_tb.vcd"...',
    'Signal value changes registered: 741 changes, 16 active signals.',
    'Simulation finished successfully at T=8450ns.'
  ];

  // Auto scroll terminal to bottom
  useEffect(() => {
    if (consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Handle running simulation
  const runSimulation = () => {
    if (isCompiling) return;
    setIsCompiling(true);
    setLogs([]);
    setTestPercent(0);
    setHasRun(false);

    let logIdx = 0;
    const totalLines = simulationLogs.length;

    const interval = setInterval(() => {
      if (logIdx < totalLines) {
        setLogs(prev => [...prev, simulationLogs[logIdx]]);
        setTestPercent(Math.floor(((logIdx + 1) / totalLines) * 100));
        logIdx++;
      } else {
        clearInterval(interval);
        setIsCompiling(false);
        setHasRun(true);
        // Call parent feedback to populate waveform tracer instantly
        onSimulationLoadWaveforms();
      }
    }, 60); // fast pacing
  };

  return (
    <div className="w-full bg-slate-950 border border-white/5 rounded-xl p-5 md:p-6 flex flex-col gap-4 relative overflow-hidden" id="testbench_console">
      {/* terminal header */}
      <div className="flex justify-between items-center pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-digital-green" />
          <h3 className="font-display font-bold text-white text-sm">Design Verification Console</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-slate-500">COMPILER: IVEPP V11.0</span>
          
          <button
            onClick={runSimulation}
            disabled={isCompiling}
            className={`flex items-center gap-1 text-[11px] font-mono font-bold px-3 py-1.5 rounded cursor-pointer transition-all ${
              isCompiling
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-digital-green hover:bg-opacity-80 text-black border border-digital-green'
            }`}
          >
            {isCompiling ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> RUNNING...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-black" /> EXECUTE VERILOG TESTBENCH
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {isCompiling && (
        <div className="w-full h-1 bg-slate-900 rounded overflow-hidden">
          <div
            className="h-full bg-digital-green transition-all duration-70"
            style={{ width: `${testPercent}%` }}
          />
        </div>
      )}

      {/* Console log outputs */}
      <div 
        className="w-full h-80 bg-black/90 p-4 rounded-lg font-mono text-[11px] leading-relaxed overflow-y-auto border border-white/5 shadow-inner"
        id="mock_terminal"
      >
        {logs.length === 0 ? (
          <div className="text-slate-600 h-full flex flex-col items-center justify-center gap-2">
            <span>$ bash -c "iverilog -o digital_clock_sim *.v"</span>
            <span className="text-[10px]">Ready to process structural files. Click execute above to run self-checks.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1 text-slate-400">
            {logs.map((line, idx) => {
              // Color highlight parsers for authentic command-line aesthetic
              let colorClass = 'text-slate-300';
              if (line.startsWith('  $')) {
                colorClass = 'text-digital-amber font-semibold';
              } else if (line.includes('[PASS]')) {
                colorClass = 'text-digital-green font-bold';
              } else if (line.includes('TESTBENCH PASSED')) {
                colorClass = 'text-emerald-400 font-extrabold text-xs glow-text-green py-2 border-y border-emerald-950/40 my-2';
              } else if (line.startsWith('========') || line.includes('STARTING TECHNICAL')) {
                colorClass = 'text-slate-500 font-bold';
              } else if (line.includes('Finished') || line.includes('finished')) {
                colorClass = 'text-slate-200';
              } else if (line.startsWith('[TEST')) {
                colorClass = 'text-slate-100 font-bold border-l-2 border-digital-blue pl-2 mt-2';
              } else if (line.startsWith('Parsing') || line.startsWith('Compiling') || line.startsWith('Executing')) {
                colorClass = 'text-digital-blue font-bold mt-1';
              }

              return (
                <div key={idx} className={`${colorClass} whitespace-pre-wrap`}>
                  {line}
                </div>
              );
            })}
            <div ref={consoleBottomRef} />
          </div>
        )}
      </div>

      {/* Post run VCD generator helper */}
      {hasRun && (
        <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-900/40 p-3 rounded-lg text-[10.5px] font-mono text-emerald-300 animate-slide-in" id="testbench_completed_alert">
          <CheckCircle2 className="w-4 h-4 text-digital-green flex-shrink-0" />
          <span>Synthesis waveforms loaded! <strong>"digital_clock_tb.vcd"</strong> database is ready. Toggle the <strong>Logic Waveforms</strong> tab to load interactive timing traces.</span>
        </div>
      )}
    </div>
  );
};
