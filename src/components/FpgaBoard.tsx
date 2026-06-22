// =============================================================================
// Component Name: FpgaBoard
// Description:    Interactive Virtual FPGA Motherboard Layout.
//                 Renders six vector SVG 7-segment displays, active sliding
//                 switches, debouncing action buttons, and BGA chip.
// =============================================================================

import React, { useState } from 'react';
import { Cpu, RotateCcw, Volume2, Sliders, Lightbulb } from 'lucide-react';
import { SimState, ClockState } from '../vlsiclock/clock_engine';

interface FpgaBoardProps {
  state: SimState;
  onButtonPress: (btn: 'mode' | 'inc' | 'alarm_set' | 'snooze' | 'reset', isPressed: boolean) => void;
  onSwitchToggle: (sw: '12_24' | 'alarm_en', value: boolean) => void;
  bounceEnabled: boolean;
  setBounceEnabled: (v: boolean) => void;
  scanSpeed: 'realtime' | 'slow_motion';
  setScanSpeed: (v: 'realtime' | 'slow_motion') => void;
}

// 7-segment custom SVG layout
// active cathodes list: seg = [a, b, c, d, e, f, g] as active-low (false = GLOWING/ON, true = DARK/OFF)
const SevenSegDigit: React.FC<{
  seg: boolean[];
  dp: boolean;
  active: boolean; // Is anode active?
  glowColor: string;
}> = ({ seg, dp, active, glowColor }) => {
  // If anode is inactive, all segments are dark
  const isSegOn = (idx: number) => !seg[idx] && active;
  const isDpOn = !dp && active;

  const colorOn = glowColor;
  const colorOff = 'rgba(255, 255, 255, 0.02)';
  const glowShadow = isSegOn ? `drop-shadow(0 0 4px ${colorOn})` : 'none';

  return (
    <svg viewBox="0 0 50 80" className="w-10 h-16 md:w-14 md:h-22 select-none" id="seg_digit">
      {/* Target segments (A, B, C, D, E, F, G) */}
      {/* Segment A (top horizontal) */}
      <path
        d="M 10 10 L 40 10 L 35 15 L 15 15 Z"
        fill={isSegOn(0) ? colorOn : colorOff}
        style={{ filter: isSegOn(0) ? glowShadow : 'none' }}
      />
      {/* Segment F (top left vertical) */}
      <path
        d="M 8 12 L 13 17 L 13 38 L 8 41 Z"
        fill={isSegOn(5) ? colorOn : colorOff}
        style={{ filter: isSegOn(5) ? glowShadow : 'none' }}
      />
      {/* Segment B (top right vertical) */}
      <path
        d="M 42 12 L 42 41 L 37 38 L 37 17 Z"
        fill={isSegOn(1) ? colorOn : colorOff}
        style={{ filter: isSegOn(1) ? glowShadow : 'none' }}
      />
      {/* Segment G (middle horizontal) */}
      <path
        d="M 12 42 L 38 42 L 34 45 L 16 45 L 12 42"
        fill={isSegOn(6) ? colorOn : colorOff}
        style={{ filter: isSegOn(6) ? glowShadow : 'none' }}
      />
      {/* Segment E (bottom left vertical) */}
      <path
        d="M 8 44 L 13 47 L 13 68 L 8 71 Z"
        fill={isSegOn(4) ? colorOn : colorOff}
        style={{ filter: isSegOn(4) ? glowShadow : 'none' }}
      />
      {/* Segment C (bottom right vertical) */}
      <path
        d="M 42 44 L 42 71 L 37 68 L 37 47 Z"
        fill={isSegOn(2) ? colorOn : colorOff}
        style={{ filter: isSegOn(2) ? glowShadow : 'none' }}
      />
      {/* Segment D (bottom horizontal) */}
      <path
        d="M 15 70 L 35 70 L 40 75 L 10 75 Z"
        fill={isSegOn(3) ? colorOn : colorOff}
        style={{ filter: isSegOn(3) ? glowShadow : 'none' }}
      />
      {/* Decimal Point (DP) */}
      <circle
        cx="44" cy="74" r="3.5"
        fill={isDpOn ? colorOn : colorOff}
        style={{ filter: isDpOn ? `drop-shadow(0 0 5px ${colorOn})` : 'none' }}
      />
    </svg>
  );
};

export const FpgaBoard: React.FC<FpgaBoardProps> = ({
  state,
  onButtonPress,
  onSwitchToggle,
  bounceEnabled,
  setBounceEnabled,
  scanSpeed,
  setScanSpeed,
}) => {
  // To render composite view vs live scanning anode view
  const [multiplexOverlay, setMultiplexOverlay] = useState<boolean>(false);

  // Read current active code state for displays
  const getDisplayStateName = (st: ClockState) => {
    switch (st) {
      case ClockState.STATE_NORMAL: return 'RUNNING TIME (HH:MM:SS)';
      case ClockState.STATE_SET_HH: return 'MANUAL HOUR CALIB (SET HH)';
      case ClockState.STATE_SET_MM: return 'MANUAL MINUTE CALIB (SET MM)';
      case ClockState.STATE_ALARM_HH: return 'ALARM ALIGN HOURS (ALM HH)';
      case ClockState.STATE_ALARM_MM: return 'ALARM ALIGN MINUTES (ALM MM)';
    }
  };

  // Convert binary counters to static displays for composite non-multiplex representation
  // (Provides easy reading for clock normal state)
  const isAlarmSetState = state.current_state === ClockState.STATE_ALARM_HH || state.current_state === ClockState.STATE_ALARM_MM;
  const hoursVal = isAlarmSetState ? state.alarm_hours : state.reg_hours;
  const minsVal = isAlarmSetState ? state.alarm_minutes : state.reg_minutes;
  const secsVal = isAlarmSetState ? 0 : state.reg_seconds;

  // Format hours format 12/24
  let displayHr = hoursVal;
  let isPmActive = false;
  if (!state.sw_12_24) {
    isPmActive = hoursVal >= 12;
    if (hoursVal === 0) displayHr = 12;
    else if (hoursVal > 12) displayHr = hoursVal - 12;
  }

  // Segment illumination overrides
  // When multiplex mode is real-time, the average eyes merge the flickering digits.
  // We can simulate:
  // "Standard Composite": displays the blended values instantly
  // "Multiplex Scanning": displays only the active digit in real time!
  const isDigitActive = (idx: number) => {
    if (scanSpeed === 'slow_motion') {
      return !state.an[idx]; // Reflect exact hardware anode value
    }
    return true; // Always on composite visualization
  };

  const getDigitCathodes = (idx: number) => {
    if (scanSpeed === 'slow_motion') {
      return state.seg; // Exact anode cathodes bus on hardware pinout
    }
    // Calculate static values for composite view
    const hTens = Math.floor(displayHr / 10);
    const hOnes = displayHr % 10;
    const mTens = Math.floor(minsVal / 10);
    const mOnes = minsVal % 10;
    const sTens = Math.floor(secsVal / 10);
    const sOnes = secsVal % 10;

    let targetCode = [true, true, true, true, true, true, true];
    let isBlinking = false;
    const bk = state.blink_tick;

    switch (idx) {
      case 5:
        targetCode = getCathodes(hTens);
        isBlinking = (state.current_state === ClockState.STATE_SET_HH || state.current_state === ClockState.STATE_ALARM_HH) && bk;
        break;
      case 4:
        targetCode = getCathodes(hOnes);
        isBlinking = (state.current_state === ClockState.STATE_SET_HH || state.current_state === ClockState.STATE_ALARM_HH) && bk;
        break;
      case 3:
        targetCode = getCathodes(mTens);
        isBlinking = (state.current_state === ClockState.STATE_SET_MM || state.current_state === ClockState.STATE_ALARM_MM) && bk;
        break;
      case 2:
        targetCode = getCathodes(mOnes);
        isBlinking = (state.current_state === ClockState.STATE_SET_MM || state.current_state === ClockState.STATE_ALARM_MM) && bk;
        break;
      case 1:
        targetCode = getCathodes(sTens);
        isBlinking = false;
        break;
      case 0:
        targetCode = getCathodes(sOnes);
        isBlinking = false;
        break;
    }

    if (isBlinking) {
      return [true, true, true, true, true, true, true]; // Turn off cathodes when blanking
    }
    return targetCode;
  };

  const getDecimalPoint = (idx: number) => {
    if (scanSpeed === 'slow_motion') {
      return state.dp;
    }
    // Static separation decimal points after digit 4 (hrs) and digit 2 (mins)
    return !(idx === 4 || idx === 2);
  };

  return (
    <div className="w-full fpga-panel rounded-2xl p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden" id="fpga_board">
      {/* Substrate Background scanlines */}
      <div className="absolute inset-0 analog-scanner pointer-events-none opacity-20 z-0"></div>

      {/* Header/Chassis Identification */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10 border-b border-white/10 pb-4">
        <div>
          <span className="font-mono text-xs text-digital-green uppercase font-semibold">DIGILENT BASYS-3 Virtualization</span>
          <h2 className="font-display text-lg text-white font-bold tracking-tight">XC7A35T-1CPG236C Core Simulation</h2>
        </div>
        
        {/* Lab Controls and parameters */}
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded border border-white/5" id="bounce_en">
            <span className="text-slate-400">Tactile Bounce:</span>
            <button
              onClick={() => setBounceEnabled(!bounceEnabled)}
              className={`px-1.5 py-0.5 rounded cursor-pointer font-bold ${
                bounceEnabled ? 'bg-digital-amber text-slate-950' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {bounceEnabled ? 'ON (15ms)' : 'OFF (SYNC)'}
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded border border-white/5" id="multiplex_set">
            <span className="text-slate-400">Display Mux:</span>
            <button
              onClick={() => setScanSpeed(scanSpeed === 'realtime' ? 'slow_motion' : 'realtime')}
              className={`px-1.5 py-0.5 rounded cursor-pointer font-bold ${
                scanSpeed === 'slow_motion' ? 'bg-digital-blue text-white' : 'bg-digital-green text-slate-950'
              }`}
            >
              {scanSpeed === 'slow_motion' ? 'SLOW SCAN (20Hz)' : 'POV MERGED (1kHz)'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Board Components Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 my-4 items-center">
        
        {/* LEFT COLUMN: Main Glowing segment screen */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-black/95 border-2 border-slate-700 p-4 rounded-xl flex flex-col justify-between shadow-inner relative" id="seven_segment_screen">
            {/* Screen Metadata */}
            <div className="flex justify-between items-center mb-3 text-[10px] font-mono text-slate-500">
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${scanSpeed === 'slow_motion' ? 'bg-digital-blue' : 'bg-digital-green'} animate-ping`}></span>
                STATE: {getDisplayStateName(state.current_state)}
              </span>
              <span>COMMON ANODE SCANNING RATE: {scanSpeed === 'slow_motion' ? '20 Hz' : '1.0 kHz'}</span>
            </div>

            {/* Glowing Numbers Box */}
            <div className="flex justify-center items-center gap-1 md:gap-3 py-4 border-y border-slate-800 relative bg-gradient-to-b from-[#0A0B0E] to-[#14161B] rounded">
              {/* Digit 5 - Hours Tens */}
              <SevenSegDigit seg={getDigitCathodes(5)} dp={getDecimalPoint(5)} active={isDigitActive(5)} glowColor={isAlarmSetState ? '#f59e0b' : '#06b6d4'} />
              {/* Digit 4 - Hours Ones */}
              <SevenSegDigit seg={getDigitCathodes(4)} dp={getDecimalPoint(4)} active={isDigitActive(4)} glowColor={isAlarmSetState ? '#f59e0b' : '#06b6d4'} />
              
              {/* Colon dots represented as custom glowing circles */}
              <div className="flex flex-col gap-4 mx-1">
                <span className={`w-2.5 h-2.5 rounded-full transition-opacity duration-300 ${(!isAlarmSetState && state.reg_seconds % 2 === 0 && scanSpeed === 'realtime') ? 'bg-digital-green' : 'bg-[#14161B]'}`} style={{ boxShadow: (!isAlarmSetState && state.reg_seconds % 2 === 0 && scanSpeed === 'realtime') ? '0 0 6px #06b6d4' : 'none' }}></span>
                <span className={`w-2.5 h-2.5 rounded-full transition-opacity duration-300 ${(!isAlarmSetState && state.reg_seconds % 2 === 0 && scanSpeed === 'realtime') ? 'bg-digital-green' : 'bg-[#14161B]'}`} style={{ boxShadow: (!isAlarmSetState && state.reg_seconds % 2 === 0 && scanSpeed === 'realtime') ? '0 0 6px #06b6d4' : 'none' }}></span>
              </div>

              {/* Digit 3 - Minutes Tens */}
              <SevenSegDigit seg={getDigitCathodes(3)} dp={getDecimalPoint(3)} active={isDigitActive(3)} glowColor={isAlarmSetState ? '#f59e0b' : '#06b6d4'} />
              {/* Digit 2 - Minutes Ones */}
              <SevenSegDigit seg={getDigitCathodes(2)} dp={getDecimalPoint(2)} active={isDigitActive(2)} glowColor={isAlarmSetState ? '#f59e0b' : '#06b6d4'} />

              {/* Colon dots */}
              <div className="flex flex-col gap-4 mx-1">
                <span className={`w-2.5 h-2.5 rounded-full transition-opacity duration-300 ${(!isAlarmSetState && state.reg_seconds % 2 === 0 && scanSpeed === 'realtime') ? 'bg-digital-green' : 'bg-[#14161B]'}`} style={{ boxShadow: (!isAlarmSetState && state.reg_seconds % 2 === 0 && scanSpeed === 'realtime') ? '0 0 6px #06b6d4' : 'none' }}></span>
                <span className={`w-2.5 h-2.5 rounded-full transition-opacity duration-300 ${(!isAlarmSetState && state.reg_seconds % 2 === 0 && scanSpeed === 'realtime') ? 'bg-digital-green' : 'bg-[#14161B]'}`} style={{ boxShadow: (!isAlarmSetState && state.reg_seconds % 2 === 0 && scanSpeed === 'realtime') ? '0 0 6px #06b6d4' : 'none' }}></span>
              </div>

              {/* Digit 1 - Seconds Tens */}
              <SevenSegDigit seg={getDigitCathodes(1)} dp={getDecimalPoint(1)} active={isDigitActive(1)} glowColor={isAlarmSetState ? '#f59e0b' : '#06b6d4'} />
              {/* Digit 0 - Seconds Ones */}
              <SevenSegDigit seg={getDigitCathodes(0)} dp={getDecimalPoint(0)} active={isDigitActive(0)} glowColor={isAlarmSetState ? '#f59e0b' : '#06b6d4'} />

              {/* Buzzer Ring Indicator Icon Overlay */}
              {state.buzzer && (
                <div className="absolute right-3 top-3 flex items-center justify-center bg-red-900/40 text-red-400 p-2 rounded-full border border-red-500/30 animate-pulse" id="alarm_buzzer_pulse">
                  <Volume2 className="w-5 h-5 animate-bounce" />
                </div>
              )}
            </div>

            {/* LED Status bank beneath display */}
            <div className="flex items-center justify-between mt-3 px-1 font-mono text-[10px]">
              <div className="flex gap-4">
                {/* PM indicator */}
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded ${state.led_pm ? 'bg-digital-amber' : 'bg-white/10'}`} style={{ boxShadow: state.led_pm ? '0 0 6px #f59e0b' : 'none' }}></span>
                  <span className={`${state.led_pm ? 'text-digital-amber' : 'text-slate-500'}`}>PM MODE</span>
                </div>

                {/* Alarm set LED */}
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded ${state.led_alarm_armed ? 'bg-digital-red' : 'bg-white/10'}`} style={{ boxShadow: state.led_alarm_armed ? '0 0 6px #ef4444' : 'none' }}></span>
                  <span className={`${state.led_alarm_armed ? 'text-digital-red' : 'text-slate-500'}`}>ALARM ARMED</span>
                </div>
              </div>

              {/* ACTIVE INPUT STATUS */}
              <div className="text-slate-600">
                ACTIVE BUS: <span className="text-slate-400 font-bold">AN[5:0]:{state.an.map(a => a ? '1' : '0').join('')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: FPGA BGA Processor Graphic + Pins description */}
        <div className="lg:col-span-4 flex items-center justify-center p-4 bg-slate-950/70 border border-white/5 rounded-xl text-center shadow-inner h-full min-h-[170px] relative">
          <div className="absolute top-2 left-2 text-[8px] font-mono text-slate-600">CENTRAL SILICON</div>
          <div className="flex flex-col items-center gap-3">
            {/* FPGA IC visualization */}
            <div className="w-20 h-20 p-1 bg-slate-800 rounded-lg shadow-lg border border-slate-700 flex items-center justify-center relative">
              {/* Silicon Pin Grid Array edges */}
              <div className="absolute inset-0.5 border border-dashed border-slate-600/40 rounded"></div>
              <div className="w-14 h-14 bg-slate-900 border border-slate-600 rounded flex flex-col items-center justify-center text-[9px] font-mono text-slate-300 font-bold">
                <Cpu className={`w-5 h-5 text-digital-green mb-1 ${state.clk_tick_count % 2 === 0 ? 'scale-105 opacity-90' : 'scale-100 opacity-75'}`} />
                <span>ARTIX-7</span>
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[9px] text-slate-500">FPGA TEMP: 32.5°C | SPEED: 50MHz</span>
              <span className="font-mono text-[10px] text-slate-300 font-medium">XC7A35T BGA236 PKG</span>
              {state.snooze_armed && (
                <span className="font-mono text-[9px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800 animate-pulse mt-1">
                  SNOOZE RE-ARM AT: {state.snooze_trigger_hr.toString().padStart(2, '0')}:{state.snooze_trigger_min.toString().padStart(2, '0')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER: Virtual Hardware Slide Switches and Pushbuttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-white/10 pt-6">
        
        {/* SW_BANK: Slide Swithes (Config) */}
        <div className="flex flex-col gap-4">
          <label className="font-mono text-[11px] text-slate-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-digital-green" /> SW15-SW0 Slide Configuration
          </label>
          <div className="flex gap-4 p-4 bg-slate-950/40 border border-white/5 rounded-xl">
            
            {/* Switch 0: 12_24 selector */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="font-mono text-[8px] text-slate-500">SW0 (D1)</span>
              <button
                onClick={() => onSwitchToggle('12_24', !state.sw_12_24)}
                className={`w-10 h-16 rounded-lg p-1 transition-all cursor-pointer flex flex-col justify-between items-center bg-slate-900 border ${
                  state.sw_12_24 ? 'border-digital-green' : 'border-slate-800'
                }`}
              >
                <div className={`w-8 h-6 rounded ${state.sw_12_24 ? 'bg-digital-green' : 'bg-slate-700'} shadow`}></div>
                <div className={`w-8 h-6 rounded ${!state.sw_12_24 ? 'bg-opacity-0' : 'bg-opacity-0'}`}></div>
              </button>
              <div className="flex flex-col text-center font-mono text-[9px] text-slate-400">
                <span className="font-bold text-[10px] text-white">{state.sw_12_24 ? '24 HR' : '12 HR'}</span>
                <span>DISPLAY</span>
              </div>
            </div>

            {/* Switch 1: Alarm Enable */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="font-mono text-[8px] text-slate-500">SW1 (D2)</span>
              <button
                onClick={() => onSwitchToggle('alarm_en', !state.sw_alarm_en)}
                className={`w-10 h-16 rounded-lg p-1 transition-all cursor-pointer flex flex-col justify-between items-center bg-slate-900 border ${
                  state.sw_alarm_en ? 'border-digital-red' : 'border-slate-800'
                }`}
              >
                <div className={`w-8 h-6 rounded ${state.sw_alarm_en ? 'bg-digital-red' : 'bg-slate-700'} shadow`}></div>
                <div className={`w-8 h-6 rounded ${!state.sw_alarm_en ? 'bg-opacity-0' : 'bg-opacity-0'}`}></div>
              </button>
              <div className="flex flex-col text-center font-mono text-[9px] text-slate-400">
                <span className="font-bold text-[10px] text-white">{state.sw_alarm_en ? 'ARMED' : 'OFF'}</span>
                <span>ALARM SWITCH</span>
              </div>
            </div>

            {/* Simulated Blank switches for hardware authenticity */}
            {[2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2 opacity-30 flex-1">
                <span className="font-mono text-[8px] text-slate-500">SW{i}</span>
                <div className="w-10 h-16 rounded-lg p-1 bg-slate-950 border border-slate-900 flex flex-col justify-between items-center">
                  <div className="w-8 h-6 rounded bg-slate-800"></div>
                </div>
                <span className="text-[8px] font-mono text-slate-600">RESERVED</span>
              </div>
            ))}

          </div>
        </div>

        {/* BTN_BANK: Tactical Push buttons */}
        <div className="flex flex-col gap-4">
          <label className="font-mono text-[11px] text-slate-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-digital-amber" /> BTN-PAD Mechanical Buttons
          </label>
          <div className="flex gap-2 p-3 bg-slate-950/40 border border-white/5 rounded-xl justify-between">
            
            {/* RESET Button */}
            <div className="flex flex-col items-center gap-1">
              <button
                onMouseDown={() => onButtonPress('reset', true)}
                onMouseUp={() => onButtonPress('reset', false)}
                onMouseLeave={() => onButtonPress('reset', false)}
                onTouchStart={(e) => { e.preventDefault(); onButtonPress('reset', true); }}
                onTouchEnd={(e) => { e.preventDefault(); onButtonPress('reset', false); }}
                className={`w-12 h-12 rounded-full cursor-pointer bg-slate-800 border-2 border-slate-600 shadow-md active:scale-95 transition-all flex items-center justify-center text-slate-300 active:bg-slate-700 active:border-slate-500`}
              >
                <RotateCcw className="w-5 h-5 text-red-400" />
              </button>
              <span className="font-mono text-[8px] text-slate-400 text-center">BTN_RST<br/>(RESET_N)</span>
            </div>

            {/* MODE Button */}
            <div className="flex flex-col items-center gap-1">
              <button
                onMouseDown={() => onButtonPress('mode', true)}
                onMouseUp={() => onButtonPress('mode', false)}
                onMouseLeave={() => onButtonPress('mode', false)}
                onTouchStart={(e) => { e.preventDefault(); onButtonPress('mode', true); }}
                onTouchEnd={(e) => { e.preventDefault(); onButtonPress('mode', false); }}
                className={`w-12 h-12 rounded-full cursor-pointer bg-slate-800 border-2 border-slate-600 shadow-md active:scale-95 transition-all flex flex-col items-center justify-center font-mono font-bold text-xs text-white ${
                  state.btn_mode_raw ? 'bg-slate-600 border-slate-400' : ''
                }`}
              >
                M
              </button>
              <span className="font-mono text-[8px] text-slate-400 text-center">BTN_C<br/>(MODE)</span>
            </div>

            {/* INCREMENT Button */}
            <div className="flex flex-col items-center gap-1">
              <button
                onMouseDown={() => onButtonPress('inc', true)}
                onMouseUp={() => onButtonPress('inc', false)}
                onMouseLeave={() => onButtonPress('inc', false)}
                onTouchStart={(e) => { e.preventDefault(); onButtonPress('inc', true); }}
                onTouchEnd={(e) => { e.preventDefault(); onButtonPress('inc', false); }}
                className={`w-12 h-12 rounded-full cursor-pointer bg-slate-800 border-2 border-slate-600 shadow-md active:scale-95 transition-all flex flex-col items-center justify-center font-mono font-bold text-xs text-white ${
                  state.btn_inc_raw ? 'bg-slate-600 border-slate-400' : ''
                }`}
              >
                +
              </button>
              <span className="font-mono text-[8px] text-slate-400 text-center">BTN_U<br/>(INCREMENT)</span>
            </div>

            {/* ALARM_SET Button */}
            <div className="flex flex-col items-center gap-1">
              <button
                onMouseDown={() => onButtonPress('alarm_set', true)}
                onMouseUp={() => onButtonPress('alarm_set', false)}
                onMouseLeave={() => onButtonPress('alarm_set', false)}
                onTouchStart={(e) => { e.preventDefault(); onButtonPress('alarm_set', true); }}
                onTouchEnd={(e) => { e.preventDefault(); onButtonPress('alarm_set', false); }}
                className={`w-12 h-12 rounded-full cursor-pointer bg-slate-800 border-2 border-slate-600 shadow-md active:scale-95 transition-all flex flex-col items-center justify-center font-mono font-bold text-[10px] text-white ${
                  state.btn_alarm_set_raw ? 'bg-slate-600 border-slate-400' : ''
                }`}
              >
                SET
              </button>
              <span className="font-mono text-[8px] text-slate-400 text-center">BTN_L<br/>(ALARM_SET)</span>
            </div>

            {/* SNOOZE Button */}
            <div className="flex flex-col items-center gap-1">
              <button
                onMouseDown={() => onButtonPress('snooze', true)}
                onMouseUp={() => onButtonPress('snooze', false)}
                onMouseLeave={() => onButtonPress('snooze', false)}
                onTouchStart={(e) => { e.preventDefault(); onButtonPress('snooze', true); }}
                onTouchEnd={(e) => { e.preventDefault(); onButtonPress('snooze', false); }}
                className={`w-12 h-12 rounded-full cursor-pointer bg-slate-800 border-2 border-slate-600 shadow-md active:scale-95 transition-all flex flex-col items-center justify-center font-mono font-bold text-[10px] text-white ${
                  state.btn_snooze_raw ? 'bg-slate-600 border-slate-400' : ''
                }`}
              >
                SNZ
              </button>
              <span className="font-mono text-[8px] text-slate-400 text-center">BTN_D<br/>(SNOOZE)</span>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};

// Help convert single numbers to 7-segment cathodes array
function getCathodes(hex: number): boolean[] {
  // Same array as defined in clock_engine
  switch (hex) {
    case 0:  return [false, false, false, false, false, false, true];  // "0"
    case 1:  return [true, false, false, true, true, true, true];      // "1"
    case 2:  return [false, false, true, false, false, true, false];   // "2"
    case 3:  return [false, false, false, false, true, true, false];   // "3"
    case 4:  return [true, false, false, true, true, false, false];    // "4"
    case 5:  return [false, true, false, false, true, false, false];    // "5"
    case 6:  return [false, true, false, false, false, false, false];   // "6"
    case 7:  return [false, false, false, true, true, true, true];      // "7"
    case 8:  return [false, false, false, false, false, false, false];  // "8"
    case 9:  return [false, false, false, false, true, false, false];   // "9"
    default: return [true, true, true, true, true, true, true];
  }
}
