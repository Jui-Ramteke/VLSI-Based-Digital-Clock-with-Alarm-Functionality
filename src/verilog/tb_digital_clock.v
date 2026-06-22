// =============================================================================
// Module Name:  tb_digital_clock
// Description:  Industry-Grade Self-Checking Testbench for Digital Clock.
//               Validates standard operational transitions, clock division,
//               12/24-hour switching, alarm triggering, and snooze delays.
//               Generates VCD output waveforms compatible with GTKWave tools.
// =============================================================================

`timescale 1ns / 1ps

module tb_digital_clock;

    // -------------------------------------------------------------------------
    // 1. Testbench Signals Mapping
    // -------------------------------------------------------------------------
    reg        clk;
    reg        rst_n;
    reg        btn_mode;
    reg        btn_inc;
    reg        btn_alarm_set;
    reg        btn_snooze;
    reg        sw_12_24;
    reg        sw_alarm_en;

    wire [5:0] an;
    wire [6:0] seg;
    wire       dp;
    wire       led_alarm_armed;
    wire       led_pm;
    wire       buzzer;

    integer    error_count;

    // -------------------------------------------------------------------------
    // 2. Unit Under Test (UUT) Instantiation
    // -------------------------------------------------------------------------
    digital_clock #(
        .CLK_FREQ(100),            // Downscaled clock to 100Hz for high-speed simulation
        .DEBOUNCE_COUNTS(2),       // Minimum debounce counts for high-speed simulation triggers
        .MUX_LIMIT(2),             // Minimum multiplexing sweep 
        .SIMULATION(1)             // Flag to activate scaled dividers in verilog
    ) uut (
        .clk(clk),
        .rst_n(rst_n),
        .btn_mode(btn_mode),
        .btn_inc(btn_inc),
        .btn_alarm_set(btn_alarm_set),
        .btn_snooze(btn_snooze),
        .sw_12_24(sw_12_24),
        .sw_alarm_en(sw_alarm_en),
        .an(an),
        .seg(seg),
        .dp(dp),
        .led_alarm_armed(led_alarm_armed),
        .led_pm(led_pm),
        .buzzer(buzzer)
    );

    // -------------------------------------------------------------------------
    // 3. Clock Generation (50 MHz Simulation Clock: 20ns period)
    // -------------------------------------------------------------------------
    always begin
        #10 clk = ~clk;
    end

    // Helper task to simulate a stable button press (pulse) with safety padding
    task press_button;
        input integer button_select; // 0=mode, 1=inc, 2=alarm_set, 3=snooze
        begin
            case (button_select)
                0: btn_mode = 1'b1;
                1: btn_inc = 1'b1;
                2: btn_alarm_set = 1'b1;
                3: btn_snooze = 1'b1;
            endcase
            #100; // Hold button stable (satisfying debounce limit)
            
            case (button_select)
                0: btn_mode = 1'b0;
                1: btn_inc = 1'b0;
                2: btn_alarm_set = 1'b0;
                3: btn_snooze = 1'b0;
            endcase
            #100; // Deassert padding
        end
    endtask

    // -------------------------------------------------------------------------
    // 4. Verification stimulus block
    // -------------------------------------------------------------------------
    initial begin
        // Configure Waveform Dumps
        $dumpfile("digital_clock_tb.vcd");
        $dumpvars(0, tb_digital_clock);

        // Initialize all registers
        clk           = 1'b0;
        rst_n         = 1'b1;
        btn_mode      = 1'b0;
        btn_inc       = 1'b0;
        btn_alarm_set = 1'b0;
        btn_snooze    = 1'b0;
        sw_12_24      = 1'b1; // Default to 24-hr layout mode
        sw_alarm_en   = 1'b0; // Default: Alarm disabled
        error_count   = 0;

        $display("================================================================");
        $display("   STARTING TECHNICAL VERIFICATION TESTBENCH: VLSI DIGITAL CLOCK  ");
        $display("================================================================");

        // --- TEST 1: Assertion of Asynchronous Reset ---
        $display("[TEST 1] Testing Asynchronous Active-Low Reset...");
        #5; 
        rst_n = 1'b0; // Pull reset low
        #40;
        rst_n = 1'b1; // Release reset
        #10;
        
        // Post-Reset State Assertions
        if (uut.reg_hours != 12 || uut.reg_minutes != 0 || uut.reg_seconds != 0) begin
            $display("[FAIL] Post-Reset value mismatch! Found default state %d:%d:%d, expected 12:00:00", 
                     uut.reg_hours, uut.reg_minutes, uut.reg_seconds);
            error_count = error_count + 1;
        end else begin
            $display("[PASS] Master reset verified! Internal time default starts at 12:00:00.");
        end

        // --- TEST 2: Verification of 12/24 Hour Formatter UI ---
        $display("[TEST 2] Testing 12/24 Hour conversion state...");
        sw_12_24 = 1'b0; // Switch to 12-hour format
        #20;
        if (uut.hours_to_display != 12 || led_pm == 1'b1) begin
            $display("[FAIL] Hour 12 (AM) mismatch! Formatted hour = %d, PM state = %b", uut.hours_to_display, led_pm);
            error_count = error_count + 1;
        end else begin
            $display("[PASS] 12-hour converter displays 12 AM for midnight/noon boundary correctly.");
        end
        
        sw_12_24 = 1'b1; // Restore 24-hour mode

        // --- TEST 3: Verification of Automated Seconds/Minutes roll-overs ---
        $display("[TEST 3] Simulating normal count rollover triggers...");
        // Accelerate seconds count: force internal registers close to wrapping boundary
        #50;
        uut.reg_hours   = 6'd23;
        uut.reg_minutes = 6'd59;
        uut.reg_seconds = 6'd58;
        #2000; // Allow 2 real simulation seconds to roll over the clock
        
        if (uut.reg_hours != 0 || uut.reg_minutes != 0 || uut.reg_seconds != 0) begin
            $display("[FAIL] Overflow Rollover test failed! Clock shows %d:%d:%d instead of 00:00:00",
                     uut.reg_hours, uut.reg_minutes, uut.reg_seconds);
            error_count = error_count + 1;
        end else begin
            $display("[PASS] Full cycle midnight roll-over verified! (23:59:59 -> 00:00:00).");
        end

        // --- TEST 4: Manual Programming Interface (Increment buttons) ---
        $display("[TEST 4] Simulating manual hour programming (SET_HH State)...");
        press_button(0); // Press mode button -> enters STATE_SET_HH
        #50;
        if (uut.current_state != uut.STATE_SET_HH) begin
            $display("[FAIL] Entering SET_HH state failed! Current state: %d", uut.current_state);
            error_count = error_count + 1;
        end else begin
            $display("[PASS] Transitioned to STATE_SET_HH successfully.");
        end
        
        // Pulsate value increment twice
        press_button(1);
        press_button(1);
        #50;
        if (uut.reg_hours != 2) begin
            $display("[FAIL] Hours manual pulse increment mismatch! Clock shows %d, expected 2", uut.reg_hours);
            error_count = error_count + 1;
        end else begin
            $display("[PASS] Segment increments twice, counting hours register from 00 up to 02 successfully.");
        end

        press_button(0); // Cycle mode button -> enters STATE_SET_MM
        press_button(0); // Cycle mode button -> returns to STATE_NORMAL

        // --- TEST 5: Alarm Programming and Comparators ---
        $display("[TEST 5] Testing Alarm Setup and Arming Comparator...");
        press_button(2); // Press btn_alarm_set to enter STATE_ALARM_HH
        #50;
        press_button(1); // Increment alarm hours twice: 06 -> 08 hours
        press_button(1);
        press_button(2); // Release alarm setting to normal
        #50;
        
        if (uut.alarm_hours != 8) begin
            $display("[FAIL] Alarm set failed! Reg value is %d, expected 8", uut.alarm_hours);
            error_count = error_count + 1;
        end else begin
            $display("[PASS] Alarm Register hours successfully set to 08:00:00.");
        end

        // --- TEST 6: Active Buzzer Trigger and Snooze Chain ---
        $display("[TEST 6] Simulating Time Match to ring Alarm Buzzer...");
        // Fast forward clock registers to match the alarm at 08:00:00
        uut.reg_hours   = 6'd8;
        uut.reg_minutes = 6'd0;
        uut.reg_seconds = 6'd0;
        sw_alarm_en   = 1'b1; // Arm Alarm Switch
        #1000;                // Tick the simulation clock a bit to trigger the comparator
        
        if (buzzer != 1'b1) begin
            $display("[FAIL] Alarm match did not trigger the piezoelectric buzzer output!");
            error_count = error_count + 1;
        end else begin
            $display("[PASS] Alarm comparison matched! Buzzer output successfully activated (High).");
        end

        // Test Snooze function
        $display("[TEST 7] Testing Snooze active silence and rescheduling logic...");
        press_button(3); // Press SNOOZE button
        #100;
        
        if (buzzer != 1'b0 || uut.snooze_armed != 1'b1 || uut.snooze_trigger_min != 5) begin
            $display("[FAIL] Snooze failed to quiet alarm! Buzzer = %b, Snooze Armed = %b, Snooze target minute = %d",
                     buzzer, uut.snooze_armed, uut.snooze_trigger_min);
            error_count = error_count + 1;
        end else begin
            $display("[PASS] Snooze successfully quieted buzzer and rescheduled trigger time to 08:05:00.");
        end

        // Clean up and summarize
        $display("================================================================");
        if (error_count == 0) begin
            $display("   TESTBENCH PASSED: VLSI DIGITAL CLOCK SYSTEM INTEGRITY OK!   ");
            $display("   Total errors encountered: %d", error_count);
        end else begin
            $display("   TESTBENCH FAILED: %d errors encountered. Review block logic.", error_count);
        end
        $display("================================================================");
        
        $finish;
    end

endmodule
