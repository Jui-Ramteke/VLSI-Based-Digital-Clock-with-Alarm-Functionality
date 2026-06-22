// =============================================================================
// Module Name:  digital_clock
// Description:  Master Top-level Parameterizable Digital Clock.
//               Controls seconds, minutes, and hours registers, and compares
//               them against an alarm register. Supports 12/24 hour display,
//               alarm arming, blinking set-modes, snooze, and buzzer output.
//               Designed for standard 50MHz master clock input. All modules of
//               the clock-enable chain are synchronous.
// =============================================================================

`timescale 1ns / 1ps

module digital_clock #(
    parameter integer CLK_FREQ          = 50000000, // 50 MHz input clock
    parameter integer DEBOUNCE_COUNTS  = 1250000,  // Stable counts for debouncing (~25ms)
    parameter integer MUX_LIMIT        = 50000,    // 1ms sweep for mux digit scanning
    parameter integer SIMULATION        = 0         // Set to 1 to scale counters down for testbenches
)(
    input  wire       clk,               // Master 50MHz board clock
    input  wire       rst_n,             // Asynchronous active-low reset
    
    // Asynchronous Button Inputs
    input  wire       btn_mode,          // Cycle setting modes
    input  wire       btn_inc,           // Increment setting values
    input  wire       btn_alarm_set,     // Toggle setup of time vs alarm time
    input  wire       btn_snooze,        // Snooze active alarm (Deactivates alarm for 5 mins)
    
    // Switch Configurations
    input  wire       sw_12_24,          // Display mode: 0 = 12-hour, 1 = 24-hour
    input  wire       sw_alarm_en,       // Alarm Armed switch: 0 = Disabled, 1 = Enabled
    
    // Real-Hardware Visual Pin Mapping
    output wire [5:0] an,                // Active-low anodselect multiplex lines [5:0] 
    output wire [6:0] seg,               // Active-low cathode lines for numerals A-G
    output wire       dp,                // Active-low decimal separator point
    
    // Hardware LED Status Lines
    output reg        led_alarm_armed,   // LED indicators: Alarm currently Armed
    output reg        led_pm,            // LED indicator: AM (0/off) vs PM (1/on)
    output reg        buzzer             // Piezoelectric buzzer signal (active-high audio pulse)
);

    // Dynamic Constants for Simulation Scaling
    // If SIMULATION is active, scale clock frequencies down to complete tests instantaneously.
    localparam integer DIVIDER_1SEC = (SIMULATION == 1) ? 50 : CLK_FREQ;
    localparam integer DIVIDER_2HZ  = (SIMULATION == 1) ? 25 : (CLK_FREQ / 2);
    localparam integer MUX_DIVIDER  = (SIMULATION == 1) ? 5  : MUX_LIMIT;

    // -------------------------------------------------------------------------
    // 1. Synchronized and Debounced Action Registers
    // -------------------------------------------------------------------------
    wire btn_mode_pulse;
    wire btn_inc_pulse;
    wire btn_alarm_set_pulse;
    wire btn_snooze_pulse;

    debounce #(.ACTIVE_LEVEL(1), .DEBOUNCE_COUNTS(DEBOUNCE_COUNTS)) deb_mode (
        .clk(clk), .rst_n(rst_n), .btn_in(btn_mode),
        .btn_out(), .btn_pulse(btn_mode_pulse)
    );

    debounce #(.ACTIVE_LEVEL(1), .DEBOUNCE_COUNTS(DEBOUNCE_COUNTS)) deb_inc (
        .clk(clk), .rst_n(rst_n), .btn_in(btn_inc),
        .btn_out(), .btn_pulse(btn_inc_pulse)
    );

    debounce #(.ACTIVE_LEVEL(1), .DEBOUNCE_COUNTS(DEBOUNCE_COUNTS)) deb_alarm_set (
        .clk(clk), .rst_n(rst_n), .btn_in(btn_alarm_set),
        .btn_out(), .btn_pulse(btn_alarm_set_pulse)
    );

    debounce #(.ACTIVE_LEVEL(1), .DEBOUNCE_COUNTS(DEBOUNCE_COUNTS)) deb_snooze (
        .clk(clk), .rst_n(rst_n), .btn_in(btn_snooze),
        .btn_out(), .btn_pulse(btn_snooze_pulse)
    );

    // -------------------------------------------------------------------------
    // 2. Clock Divider Networks (Generating Timing Chains)
    // -------------------------------------------------------------------------
    reg [25:0] sec_divider_count;
    reg        one_sec_tick; // Synchronous single cycle enable pulse

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            sec_divider_count <= 26'd0;
            one_sec_tick      <= 1'b0;
        end else begin
            if (sec_divider_count >= DIVIDER_1SEC - 1) begin
                sec_divider_count <= 26'd0;
                one_sec_tick      <= 1'b1;
            end else begin
                sec_divider_count <= sec_divider_count + 1'b1;
                one_sec_tick      <= 1'b0;
            end
        end
    end

    // 2Hz Oscillator for Blink-While-Setting visual feedback
    reg [24:0] blink_divider_count;
    reg        blink_tick;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            blink_divider_count <= 25'd0;
            blink_tick          <= 1'b0;
        end else begin
            if (blink_divider_count >= DIVIDER_2HZ - 1) begin
                blink_divider_count <= 25'd0;
                blink_tick          <= ~blink_tick;
            end else begin
                blink_divider_count <= blink_divider_count + 1'b1;
            end
        end
    end

    // -------------------------------------------------------------------------
    // 3. Operational State Machine (Setup Modes)
    // -------------------------------------------------------------------------
    localparam reg [2:0] STATE_NORMAL   = 3'd0; // Displays running time, normal operation
    localparam reg [2:0] STATE_SET_HH   = 3'd1; // Setting current hours
    localparam reg [2:0] STATE_SET_MM   = 3'd2; // Setting current minutes
    localparam reg [2:0] STATE_ALARM_HH = 3'd3; // Setting alarm hours
    localparam reg [2:0] STATE_ALARM_MM = 3'd4; // Setting alarm minutes

    reg [2:0] current_state;
    reg [2:0] next_state;

    // State Transitions
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            current_state <= STATE_NORMAL;
        end else begin
            current_state <= next_state;
        end
    end

    always @(*) begin
        next_state = current_state;
        case (current_state)
            STATE_NORMAL: begin
                if (btn_mode_pulse) 
                    next_state = STATE_SET_HH;
                else if (btn_alarm_set_pulse)
                    next_state = STATE_ALARM_HH;
            end
            STATE_SET_HH: begin
                if (btn_mode_pulse) 
                    next_state = STATE_SET_MM;
                else if (btn_alarm_set_pulse)
                    next_state = STATE_NORMAL;
            end
            STATE_SET_MM: begin
                if (btn_mode_pulse) 
                    next_state = STATE_NORMAL;
                else if (btn_alarm_set_pulse)
                    next_state = STATE_NORMAL;
            end
            STATE_ALARM_HH: begin
                if (btn_mode_pulse) 
                    next_state = STATE_ALARM_MM;
                else if (btn_alarm_set_pulse)
                    next_state = STATE_NORMAL;
            end
            STATE_ALARM_MM: begin
                if (btn_mode_pulse) 
                    next_state = STATE_NORMAL;
                else if (btn_alarm_set_pulse)
                    next_state = STATE_NORMAL;
            end
            default: next_state = STATE_NORMAL;
        endcase
    end

    // -------------------------------------------------------------------------
    // 4. Fundamental Registers (Timekeeping and Alarm)
    // -------------------------------------------------------------------------
    reg [5:0] reg_hours;   // Binary: 0-23
    reg [5:0] reg_minutes; // Binary: 0-59
    reg [5:0] reg_seconds; // Binary: 0-59

    reg [5:0] alarm_hours;   // Binary: 0-23
    reg [5:0] alarm_minutes; // Binary: 0-59

    // Timekeeper Increments / Loading Logic
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            reg_hours   <= 6'd12; // Start clock at 12:00:00
            reg_minutes <= 6'd0;
            reg_seconds <= 6'd0;
        end else begin
            // Manual adjustment triggers (Modes block the automatic rolling trigger)
            if (current_state == STATE_SET_HH) begin
                reg_seconds <= 6'd0; // Reset seconds when hours are manually set
                if (btn_inc_pulse) begin
                    if (reg_hours >= 23)
                        reg_hours <= 6'd0;
                    else
                        reg_hours <= reg_hours + 1'b1;
                end
            end else if (current_state == STATE_SET_MM) begin
                reg_seconds <= 6'd0; // Reset seconds when minutes are manually set
                if (btn_inc_pulse) begin
                    if (reg_minutes >= 59)
                        reg_minutes <= 6'd0;
                    else
                        reg_minutes <= reg_minutes + 1'b1;
                end
            end else begin
                // NORMAL clock incremental countdown chain
                if (one_sec_tick) begin
                    if (reg_seconds >= 59) begin
                        reg_seconds <= 6'd0;
                        if (reg_minutes >= 59) begin
                            reg_minutes <= 6'd0;
                            if (reg_hours >= 23) begin
                                reg_hours <= 6'd0;
                            end else begin
                                reg_hours <= reg_hours + 1'b1;
                            end
                        end else begin
                            reg_minutes <= reg_minutes + 1'b1;
                        end
                    end else begin
                        reg_seconds <= reg_seconds + 1'b1;
                    end
                end
            end
        end
    end

    // Alarm Adjustments Register Block
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            alarm_hours   <= 6'd6; // Default alarm at 06:00
            alarm_minutes <= 6'd0;
        end else begin
            if (current_state == STATE_ALARM_HH) begin
                if (btn_inc_pulse) begin
                    if (alarm_hours >= 23)
                        alarm_hours <= 6'd0;
                    else
                        alarm_hours <= alarm_hours + 1'b1;
                end
            end else if (current_state == STATE_ALARM_MM) begin
                if (btn_inc_pulse) begin
                    if (alarm_minutes >= 59)
                        alarm_minutes <= 6'd0;
                    else
                        alarm_minutes <= alarm_minutes + 1'b1;
                end
            end
        end
    end

    // -------------------------------------------------------------------------
    // 5. Active Comparator & Snooze/Buzzer State Registers
    // -------------------------------------------------------------------------
    reg snooze_armed;
    reg [5:0] snooze_trigger_hr;
    reg [5:0] snooze_trigger_min;
    reg alarm_ringing;

    // Alarm Armed LED feedback matches slide switch input
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            led_alarm_armed <= 1'b0;
        end else begin
            led_alarm_armed <= sw_alarm_en;
        end
    end

    // Ringing State Machine Logic
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            alarm_ringing      <= 1'b0;
            snooze_armed       <= 1'b0;
            snooze_trigger_hr  <= 6'd0;
            snooze_trigger_min <= 6'd0;
            buzzer             <= 1'b0;
        end else begin
            if (!sw_alarm_en) begin
                // Instantly silence if alarm switch is disarmed
                alarm_ringing <= 1'b0;
                snooze_armed  <= 1'b0;
                buzzer        <= 1'b0;
            end else begin
                // Detect normal alarm match: Hours & Minutes match, Seconds begins at 00
                if (reg_hours == alarm_hours && reg_minutes == alarm_minutes && reg_seconds == 6'd0 && !snooze_armed) begin
                    alarm_ringing <= 1'b1;
                end
                
                // Detect snooze trigger match if previously snoozed
                if (snooze_armed && reg_hours == snooze_trigger_hr && reg_minutes == snooze_trigger_min && reg_seconds == 6'd0) begin
                    alarm_ringing <= 1'b1;
                    snooze_armed  <= 1'b0; // Silenced state reset
                end

                // Handle Snooze Button pulse (silences alarm for 5 minutes)
                if (alarm_ringing && btn_snooze_pulse) begin
                    alarm_ringing <= 1'b0;
                    snooze_armed  <= 1'b1;
                    
                    // Add 5 minutes to create the new snooze match time. Keep within bounds
                    if (reg_minutes >= 55) begin
                        snooze_trigger_min <= reg_minutes + 3'd5 - 6'd60;
                        if (reg_hours >= 23)
                            snooze_trigger_hr <= 6'd0;
                        else
                            snooze_trigger_hr <= reg_hours + 1'b1;
                    end else begin
                        snooze_trigger_min <= reg_minutes + 3'd5;
                        snooze_trigger_hr  <= reg_hours;
                    end
                end

                // Turn buzzer off automatically after 1 minute if snooze/reset is not hit
                // (Done easily by checking if HH:MM no longer matches and alarm of snooze_armed isn't active)
                if (alarm_ringing && (reg_seconds == 6'd59 && reg_minutes != alarm_minutes && reg_minutes != snooze_trigger_min)) begin
                    alarm_ringing <= 1'b0;
                end

                // Buzzer driving (pulled high or oscillates when alarm is actively ringing)
                buzzer <= alarm_ringing;
            end
        end
    end

    // -------------------------------------------------------------------------
    // 6. 12/24 Hour Formatter & Display Multiplexer Routing
    // -------------------------------------------------------------------------
    reg [4:0] hours_to_display; // Formatted 1 to 12 or 0 to 23 hours
    reg [5:0] minutes_to_display;
    reg [5:0] seconds_to_display;

    // Display routing selector
    // In ALARM_HR or ALARM_MIN states, the 7-segment routes the registered alarm times.
    // In all other modes, it is normal running hours.
    wire displaying_alarm = (current_state == STATE_ALARM_HH || current_state == STATE_ALARM_MM);
    
    wire [5:0] raw_hours_mux   = displaying_alarm ? alarm_hours   : reg_hours;
    wire [5:0] raw_minutes_mux = displaying_alarm ? alarm_minutes : reg_minutes;
    wire [5:0] raw_seconds_mux = displaying_alarm ? 6'd0          : reg_seconds;

    // Convert 24-hr layout index to 12-hr indicator and scale
    always @(*) begin
        led_pm = 1'b0;
        if (sw_12_24 == 1'b0) begin // 12-Hour format selected
            // Determine PM LED status
            if (raw_hours_mux >= 6'd12) begin
                led_pm = 1'b1;
            end
            
            // Format hours value to 1-12 range
            if (raw_hours_mux == 6'd0) begin
                hours_to_display = 5'd12;
            end else if (raw_hours_mux > 6'd12) begin
                hours_to_display = raw_hours_mux - 6'd12;
            end else begin
                hours_to_display = raw_hours_mux[4:0];
            end
        end else begin // 24-Hour format selected
            hours_to_display = raw_hours_mux[4:0];
            led_pm           = 1'b0; // PM indicator not valid in 24Hr format
        end

        minutes_to_display = raw_minutes_mux;
        seconds_to_display = raw_seconds_mux;
    end

    // -------------------------------------------------------------------------
    // 7. Binary-To-BCD Converter & Blinking Mask Assign
    // -------------------------------------------------------------------------
    wire [3:0] bcd_hr_tens = hours_to_display / 4'd10;
    wire [3:0] bcd_hr_ones = hours_to_display % 4'd10;
    
    wire [3:0] bcd_min_tens = minutes_to_display / 4'd10;
    wire [3:0] bcd_min_ones = minutes_to_display % 4'd10;
    
    wire [3:0] bcd_sec_tens = seconds_to_display / 4'd10;
    wire [3:0] bcd_sec_ones = seconds_to_display % 4'd10;

    // Dynamic Blinking Mask mapping segment selectors: [5:4]=Hours, [3:2]=Minutes, [1:0]=Seconds
    reg [5:0] blink_mask;
    always @(*) begin
        case (current_state)
            STATE_SET_HH:   blink_mask = 6'b110000;
            STATE_SET_MM:   blink_mask = 6'b001100;
            STATE_ALARM_HH: blink_mask = 6'b110000;
            STATE_ALARM_MM: blink_mask = 6'b001100;
            default:        blink_mask = 6'b000000;
        endcase
    end

    // -------------------------------------------------------------------------
    // 8. Instantiating Output 7-Segment Display multiplexer
    // -------------------------------------------------------------------------
    seven_seg_mux #(.MUX_DIVIDER_LIMIT(MUX_DIVIDER)) display_driver (
        .clk(clk),
        .rst_n(rst_n),
        .hr_tens(bcd_hr_tens),
        .hr_ones(bcd_hr_ones),
        .min_tens(bcd_min_tens),
        .min_ones(bcd_min_ones),
        .sec_tens(bcd_sec_tens),
        .sec_ones(bcd_sec_ones),
        .blink_mask(blink_mask),
        .blink_tick(blink_tick),
        .an(an),
        .seg(seg),
        .dp(dp)
    );

endmodule
