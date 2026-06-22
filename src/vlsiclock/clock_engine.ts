// =============================================================================
// File Name:    clock_engine.ts
// Description:  Cycle-Accurate TypeScript Simulation Engine.
//               Replicates behavioral/structural Verilog execution in real-time.
//               Supports button bounce injection, 2-stage synchronization,
//               accumulator-based debouncers, time-keeping counters, PM indicator,
//               multiplexed anode scanning, alarm matchers, and 5-min snooze.
// =============================================================================

export enum ClockState {
  STATE_NORMAL = 0,
  STATE_SET_HH = 1,
  STATE_SET_MM = 2,
  STATE_ALARM_HH = 3,
  STATE_ALARM_MM = 4,
}

export interface SimState {
  // Global Inputs
  clk_tick_count: number;     // Simulation master clock counter
  rst_n: boolean;              // Active-low master reset

  // Button Inputs (Physical asynchronous state)
  btn_mode_raw: boolean;
  btn_inc_raw: boolean;
  btn_alarm_set_raw: boolean;
  btn_snooze_raw: boolean;

  // Button Debouncer Internal States (Exact Verilog Models)
  // For Mode Button
  deb_mode_sync1: boolean;
  deb_mode_sync2: boolean;
  deb_mode_state: boolean;
  deb_mode_count: number;
  deb_mode_prev: boolean;
  deb_mode_pulse: boolean;

  // For Inc Button
  deb_inc_sync1: boolean;
  deb_inc_sync2: boolean;
  deb_inc_state: boolean;
  deb_inc_count: number;
  deb_inc_prev: boolean;
  deb_inc_pulse: boolean;

  // For Alarm Set Button
  deb_alarm_set_sync1: boolean;
  deb_alarm_set_sync2: boolean;
  deb_alarm_set_state: boolean;
  deb_alarm_set_count: number;
  deb_alarm_set_prev: boolean;
  deb_alarm_set_pulse: boolean;

  // For Snooze Button
  deb_snooze_sync1: boolean;
  deb_snooze_sync2: boolean;
  deb_snooze_sync2_prev: boolean;
  deb_snooze_state: boolean;
  deb_snooze_count: number;
  deb_snooze_prev: boolean;
  deb_snooze_pulse: boolean;

  // Timekeepers (Verilog native register formats)
  reg_hours: number;         // 0-23
  reg_minutes: number;       // 0-59
  reg_seconds: number;       // 0-59

  // Alarm registers
  alarm_hours: number;       // 0-23
  alarm_minutes: number;     // 0-59

  // Mode Controller State
  current_state: ClockState;

  // Global settings
  sw_12_24: boolean;         // false = 12-hour, true = 24-hour
  sw_alarm_en: boolean;      // false = Off, true = Armed

  // Rescheduled Alarms (Snooze registers)
  snooze_armed: boolean;
  snooze_trigger_hr: number;
  snooze_trigger_min: number;
  alarm_ringing: boolean;

  // Timing chains
  sec_divider_count: number;
  one_sec_tick: boolean;
  blink_divider_count: number;
  blink_tick: boolean;

  // Display outputs
  an: boolean[];             // 6 active-low anode indicators, e.g. [A5, A4, A3, A2, A1, A0]
  seg: boolean[];            // 7 active-low cathodes, e.g. [a, b, c, d, e, f, g]
  dp: boolean;               // active-low decimal separator
  led_alarm_armed: boolean;
  led_pm: boolean;
  buzzer: boolean;

  // Multiplex helper
  digit_select: number;      // 0 to 5 current scanned digit
}

export interface WaveformSnapshot {
  clk: number;               // 0 or 1
  rst_n: number;             // 0 or 1
  btn_mode_raw: number;      // 1 or 0
  btn_mode_deb: number;      // 1 or 0
  btn_inc_raw: number;
  btn_inc_deb: number;
  one_sec_tick: number;
  time_val: string;          // HH:MM:SS
  alarm_val: string;         // HH:MM
  state_name: string;
  buzzer: number;
  an_bus: number;            // raw selection mask (0-63)
  seg_bus: number;           // raw cathode mask (0-127)
}

// Target constraints for simulation modeling
export const DEBOUNCE_LIMIT = 8;     // clock ticks to stabilize a button
export const SEC_LIMIT = 50;          // ticks equivalent to 1 simulation second

// Create a default initial state for simulation
export function createInitialState(): SimState {
  return {
    clk_tick_count: 0,
    rst_n: true,

    btn_mode_raw: false,
    btn_inc_raw: false,
    btn_alarm_set_raw: false,
    btn_snooze_raw: false,

    deb_mode_sync1: false,
    deb_mode_sync2: false,
    deb_mode_state: false,
    deb_mode_count: 0,
    deb_mode_prev: false,
    deb_mode_pulse: false,

    deb_inc_sync1: false,
    deb_inc_sync2: false,
    deb_inc_state: false,
    deb_inc_count: 0,
    deb_inc_prev: false,
    deb_inc_pulse: false,

    deb_alarm_set_sync1: false,
    deb_alarm_set_sync2: false,
    deb_alarm_set_state: false,
    deb_alarm_set_count: 0,
    deb_alarm_set_prev: false,
    deb_alarm_set_pulse: false,

    deb_snooze_sync1: false,
    deb_snooze_sync2: false,
    deb_snooze_sync2_prev: false,
    deb_snooze_state: false,
    deb_snooze_count: 0,
    deb_snooze_prev: false,
    deb_snooze_pulse: false,

    reg_hours: 12,
    reg_minutes: 0,
    reg_seconds: 0,

    alarm_hours: 6,
    alarm_minutes: 0,

    current_state: ClockState.STATE_NORMAL,

    sw_12_24: true, // 24hr default
    sw_alarm_en: false,

    snooze_armed: false,
    snooze_trigger_hr: 0,
    snooze_trigger_min: 0,
    alarm_ringing: false,

    sec_divider_count: 0,
    one_sec_tick: false,
    blink_divider_count: 0,
    blink_tick: false,

    an: [true, true, true, true, true, true],
    seg: [true, true, true, true, true, true, true],
    dp: true,
    led_alarm_armed: false,
    led_pm: false,
    buzzer: false,

    digit_select: 0,
  };
}

// Convert digit in 0-15 to 7 segment cathode active-low pattern
// Indexed: [a, b, c, d, e, f, g] where true = OFF, false = ON
export function getCathodes(hex: number): boolean[] {
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
    case 10: return [false, false, false, true, false, false, false];   // "A"
    case 11: return [true, true, false, false, false, false, false];    // "b"
    case 12: return [false, true, true, false, false, false, true];     // "C"
    case 13: return [true, false, false, false, false, true, false];    // "d"
    case 14: return [false, true, true, false, false, false, false];    // "E"
    case 15: return [false, true, true, true, false, false, false];     // "F"
    default: return [true, true, true, true, true, true, true];         // Off
  }
}

// Core cycle step simulator logic
// Mutates state sequentially according to exact RTL logic
export function simulateOneCycle(state: SimState): SimState {
  // Deep copy the state to return a clean update
  const ns = { ...state };

  if (!ns.rst_n) {
    // Synchronous/Asynchronous resets clear registers
    ns.reg_hours = 12;
    ns.reg_minutes = 0;
    ns.reg_seconds = 0;
    ns.alarm_hours = 6;
    ns.alarm_minutes = 0;
    ns.current_state = ClockState.STATE_NORMAL;
    ns.snooze_armed = false;
    ns.alarm_ringing = false;
    ns.sec_divider_count = 0;
    ns.one_sec_tick = false;
    ns.blink_tick = false;
    ns.buzzer = false;
    ns.led_pm = false;
    ns.led_alarm_armed = false;

    // Reset debouncers
    ns.deb_mode_sync1 = false; ns.deb_mode_sync2 = false; ns.deb_mode_state = false; ns.deb_mode_count = 0; ns.deb_mode_prev = false; ns.deb_mode_pulse = false;
    ns.deb_inc_sync1 = false; ns.deb_inc_sync2 = false; ns.deb_inc_state = false; ns.deb_inc_count = 0; ns.deb_inc_prev = false; ns.deb_inc_pulse = false;
    ns.deb_alarm_set_sync1 = false; ns.deb_alarm_set_sync2 = false; ns.deb_alarm_set_state = false; ns.deb_alarm_set_count = 0; ns.deb_alarm_set_prev = false; ns.deb_alarm_set_pulse = false;
    ns.deb_snooze_sync1 = false; ns.deb_snooze_sync2 = false; ns.deb_snooze_state = false; ns.deb_snooze_count = 0; ns.deb_snooze_prev = false; ns.deb_snooze_pulse = false;
    
    return ns;
  }

  ns.clk_tick_count += 1;

  // -------------------------------------------------------------------------
  // 1. Debouncing Logic (2-stage synchronizer + integrator count)
  // -------------------------------------------------------------------------
  
  // Mode Button Debouncer
  ns.deb_mode_sync1 = ns.btn_mode_raw;
  ns.deb_mode_sync2 = ns.deb_mode_sync1;
  if (ns.deb_mode_sync2 !== ns.deb_mode_state) {
    if (ns.deb_mode_count >= DEBOUNCE_LIMIT - 1) {
      ns.deb_mode_state = ns.deb_mode_sync2;
      ns.deb_mode_count = 0;
    } else {
      ns.deb_mode_count += 1;
    }
  } else {
    ns.deb_mode_count = 0;
  }
  ns.deb_mode_pulse = ns.deb_mode_state && !ns.deb_mode_prev;
  ns.deb_mode_prev = ns.deb_mode_state;

  // Increment Button Debouncer
  ns.deb_inc_sync1 = ns.btn_inc_raw;
  ns.deb_inc_sync2 = ns.deb_inc_sync1;
  if (ns.deb_inc_sync2 !== ns.deb_inc_state) {
    if (ns.deb_inc_count >= DEBOUNCE_LIMIT - 1) {
      ns.deb_inc_state = ns.deb_inc_sync2;
      ns.deb_inc_count = 0;
    } else {
      ns.deb_inc_count += 1;
    }
  } else {
    ns.deb_inc_count = 0;
  }
  ns.deb_inc_pulse = ns.deb_inc_state && !ns.deb_inc_prev;
  ns.deb_inc_prev = ns.deb_inc_state;

  // Alarm Set Button Debouncer
  ns.deb_alarm_set_sync1 = ns.btn_alarm_set_raw;
  ns.deb_alarm_set_sync2 = ns.deb_alarm_set_sync1;
  if (ns.deb_alarm_set_sync2 !== ns.deb_alarm_set_state) {
    if (ns.deb_alarm_set_count >= DEBOUNCE_LIMIT - 1) {
      ns.deb_alarm_set_state = ns.deb_alarm_set_sync2;
      ns.deb_alarm_set_count = 0;
    } else {
      ns.deb_alarm_set_count += 1;
    }
  } else {
    ns.deb_alarm_set_count = 0;
  }
  ns.deb_alarm_set_pulse = ns.deb_alarm_set_state && !ns.deb_alarm_set_prev;
  ns.deb_alarm_set_prev = ns.deb_alarm_set_state;

  // Snooze Button Debouncer
  ns.deb_snooze_sync1 = ns.btn_snooze_raw;
  ns.deb_snooze_sync2 = ns.deb_snooze_sync1;
  if (ns.deb_snooze_sync2 !== ns.deb_snooze_state) {
    if (ns.deb_snooze_count >= DEBOUNCE_LIMIT - 1) {
      ns.deb_snooze_state = ns.deb_snooze_sync2;
      ns.deb_snooze_count = 0;
    } else {
      ns.deb_snooze_count += 1;
    }
  } else {
    ns.deb_snooze_count = 0;
  }
  ns.deb_snooze_pulse = ns.deb_snooze_state && !ns.deb_snooze_prev;
  ns.deb_snooze_prev = ns.deb_snooze_state;


  // -------------------------------------------------------------------------
  // 2. Timing Divisor Chains
  // -------------------------------------------------------------------------
  if (ns.sec_divider_count >= SEC_LIMIT - 1) {
    ns.sec_divider_count = 0;
    ns.one_sec_tick = true;
  } else {
    ns.sec_divider_count += 1;
    ns.one_sec_tick = false;
  }

  // 2Hz Blinking Clock
  if (ns.blink_divider_count >= Math.floor(SEC_LIMIT / 2) - 1) {
    ns.blink_divider_count = 0;
    ns.blink_tick = !ns.blink_tick;
  } else {
    ns.blink_divider_count += 1;
  }


  // -------------------------------------------------------------------------
  // 3. Operational State Transitions
  // -------------------------------------------------------------------------
  const prev_state = ns.current_state;
  if (ns.deb_mode_pulse) {
    switch (ns.current_state) {
      case ClockState.STATE_NORMAL:   ns.current_state = ClockState.STATE_SET_HH; break;
      case ClockState.STATE_SET_HH:   ns.current_state = ClockState.STATE_SET_MM; break;
      case ClockState.STATE_SET_MM:   ns.current_state = ClockState.STATE_NORMAL; break;
      case ClockState.STATE_ALARM_HH: ns.current_state = ClockState.STATE_ALARM_MM; break;
      case ClockState.STATE_ALARM_MM: ns.current_state = ClockState.STATE_NORMAL; break;
      default: ns.current_state = ClockState.STATE_NORMAL;
    }
  } else if (ns.deb_alarm_set_pulse) {
    // Alarm set toggle
    if (ns.current_state === ClockState.STATE_NORMAL) {
      ns.current_state = ClockState.STATE_ALARM_HH;
    } else if (ns.current_state === ClockState.STATE_ALARM_HH || ns.current_state === ClockState.STATE_ALARM_MM) {
      ns.current_state = ClockState.STATE_NORMAL;
    } else {
      ns.current_state = ClockState.STATE_NORMAL;
    }
  }


  // -------------------------------------------------------------------------
  // 4. Timekeeping and Alarm Register Updates
  // -------------------------------------------------------------------------
  if (ns.current_state === ClockState.STATE_SET_HH) {
    ns.reg_seconds = 0; // seconds cleared when manually adjusting hours
    if (ns.deb_inc_pulse) {
      ns.reg_hours = (ns.reg_hours + 1) % 24;
    }
  } else if (ns.current_state === ClockState.STATE_SET_MM) {
    ns.reg_seconds = 0; // seconds cleared when manually adjusting minutes
    if (ns.deb_inc_pulse) {
      ns.reg_minutes = (ns.reg_minutes + 1) % 60;
    }
  } else {
    // Normal timing loop
    if (ns.one_sec_tick) {
      ns.reg_seconds += 1;
      if (ns.reg_seconds >= 60) {
        ns.reg_seconds = 0;
        ns.reg_minutes += 1;
        if (ns.reg_minutes >= 60) {
          ns.reg_minutes = 0;
          ns.reg_hours = (ns.reg_hours + 1) % 24;
        }
      }
    }
  }

  // Alarm adjustments state mapping
  if (ns.current_state === ClockState.STATE_ALARM_HH) {
    if (ns.deb_inc_pulse) {
      ns.alarm_hours = (ns.alarm_hours + 1) % 24;
    }
  } else if (ns.current_state === ClockState.STATE_ALARM_MM) {
    if (ns.deb_inc_pulse) {
      ns.alarm_minutes = (ns.alarm_minutes + 1) % 60;
    }
  }


  // -------------------------------------------------------------------------
  // 5. Active Comparator and Snooze Module
  // -------------------------------------------------------------------------
  ns.led_alarm_armed = ns.sw_alarm_en;

  if (!ns.sw_alarm_en) {
    ns.alarm_ringing = false;
    ns.snooze_armed = false;
    ns.buzzer = false;
  } else {
    // Natural alarm comparison matches at 00 seconds
    if (ns.reg_hours === ns.alarm_hours &&
        ns.reg_minutes === ns.alarm_minutes &&
        ns.reg_seconds === 0 &&
        !ns.snooze_armed) {
      ns.alarm_ringing = true;
    }

    // Monitor for rescheduled snooze alarm trigger
    if (ns.snooze_armed &&
        ns.reg_hours === ns.snooze_trigger_hr &&
        ns.reg_minutes === ns.snooze_trigger_min &&
        ns.reg_seconds === 0) {
      ns.alarm_ringing = true;
      ns.snooze_armed = false;
    }

    // Capture Snooze Button click
    if (ns.alarm_ringing && ns.deb_snooze_pulse) {
      ns.alarm_ringing = false;
      ns.snooze_armed = true;

      // Reschedule alarm match +5 minutes forwards
      let snooze_min = ns.reg_minutes + 5;
      let snooze_hr = ns.reg_hours;
      if (snooze_min >= 60) {
        snooze_min -= 60;
        snooze_hr = (snooze_hr + 1) % 24;
      }
      ns.snooze_trigger_min = snooze_min;
      ns.snooze_trigger_hr = snooze_hr;
    }

    // Buzzer auto de-assert when minute rolls over
    if (ns.alarm_ringing && ns.reg_seconds === 59 && ns.reg_minutes !== ns.alarm_minutes && ns.reg_minutes !== ns.snooze_trigger_min) {
      ns.alarm_ringing = false;
    }

    ns.buzzer = ns.alarm_ringing;
  }


  // -------------------------------------------------------------------------
  // 6. Multiplexer Logic (Scanning Digit Sweep simulation)
  // -------------------------------------------------------------------------
  // Increment scanning digit on every tick to represent standard sweep cycles
  ns.digit_select = (ns.digit_select + 1) % 6;

  // Determine display routing
  const displaying_alarm = (ns.current_state === ClockState.STATE_ALARM_HH || ns.current_state === ClockState.STATE_ALARM_MM);
  const raw_hours_mux = displaying_alarm ? ns.alarm_hours : ns.reg_hours;
  const raw_minutes_mux = displaying_alarm ? ns.alarm_minutes : ns.reg_minutes;
  const raw_seconds_mux = displaying_alarm ? 0 : ns.reg_seconds;

  // Formatter mapping (12/24 Hour converter logic)
  let hours_to_display = raw_hours_mux;
  if (!ns.sw_12_24) { // 12hr format
    if (raw_hours_mux >= 12) {
      ns.led_pm = true;
    } else {
      ns.led_pm = false;
    }

    if (raw_hours_mux === 0) {
      hours_to_display = 12;
    } else if (raw_hours_mux > 12) {
      hours_to_display = raw_hours_mux - 12;
    }
  } else {
    ns.led_pm = false; // PM disabled in 24hr format
  }

  // Extract BCD
  const h_tens = Math.floor(hours_to_display / 10);
  const h_ones = hours_to_display % 10;
  const m_tens = Math.floor(raw_minutes_mux / 10);
  const m_ones = raw_minutes_mux % 10;
  const s_tens = Math.floor(raw_seconds_mux / 10);
  const s_ones = raw_seconds_mux % 10;

  // Blinking Mask Mapping
  let active_mask = [false, false, false, false, false, false]; // [hTens, hOnes, mTens, mOnes, sTens, sOnes]
  if (ns.current_state === ClockState.STATE_SET_HH || ns.current_state === ClockState.STATE_ALARM_HH) {
    active_mask = [true, true, false, false, false, false];
  } else if (ns.current_state === ClockState.STATE_SET_MM || ns.current_state === ClockState.STATE_ALARM_MM) {
    active_mask = [false, false, true, true, false, false];
  }

  // Select active scanning digit values
  let current_val = 0;
  let is_blinking = false;
  let has_dp = false;
  ns.an = [true, true, true, true, true, true]; // Turn off all anodes (Active-low)

  switch (ns.digit_select) {
    case 5: // Hour Tens
      current_val = h_tens;
      is_blinking = active_mask[0] && ns.blink_tick;
      ns.an[5] = false; // Enable leftmost digit anode (active low)
      has_dp = false;
      break;
    case 4: // Hour Ones
      current_val = h_ones;
      is_blinking = active_mask[1] && ns.blink_tick;
      ns.an[4] = false;
      has_dp = true; // dot separator
      break;
    case 3: // Minute Tens
      current_val = m_tens;
      is_blinking = active_mask[2] && ns.blink_tick;
      ns.an[3] = false;
      has_dp = false;
      break;
    case 2: // Minute Ones
      current_val = m_ones;
      is_blinking = active_mask[3] && ns.blink_tick;
      ns.an[2] = false;
      has_dp = true; // dot separator
      break;
    case 1: // Second Tens
      current_val = s_tens;
      is_blinking = active_mask[4] && ns.blink_tick;
      ns.an[1] = false;
      has_dp = false;
      break;
    case 0: // Second Ones
      current_val = s_ones;
      is_blinking = active_mask[5] && ns.blink_tick;
      ns.an[0] = false;
      has_dp = false;
      break;
  }

  // Cathode translation
  if (is_blinking) {
    ns.seg = [true, true, true, true, true, true, true]; // Turn off cathodes (Active-low)
    ns.dp = true;
  } else {
    ns.seg = getCathodes(current_val);
    ns.dp = !has_dp; // active low digit decimal point
  }

  return ns;
}

// Convert 2-digit numbers to helper padded strings
export function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
