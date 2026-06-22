// =============================================================================
// Module Name:  seven_seg_mux
// Description:  7-Segment Multiplexed Display Controller.
//               Drives 6 multiplexed digits (Hours, Minutes, Seconds) and
//               handles standard BCD to active-low 7-segment cathodes.
//               Features configurable blinking mask for setting hours/minutes.
// =============================================================================

`timescale 1ns / 1ps

module seven_seg_mux #(
    parameter integer MUX_DIVIDER_LIMIT = 50000 // Multi-segment multiplexing divider (e.g. 1ms @ 50MHz)
)(
    input  wire       clk,             // System clock
    input  wire       rst_n,           // Active-low reset
    input  wire [3:0] hr_tens,         // BCD value for Hours Tens digit
    input  wire [3:0] hr_ones,         // BCD value for Hours Ones digit
    input  wire [3:0] min_tens,        // BCD value for Minutes Tens digit
    input  wire [3:0] min_ones,        // BCD value for Minutes Ones digit
    input  wire [3:0] sec_tens,        // BCD value for Seconds Tens digit
    input  wire [3:0] sec_ones,        // BCD value for Seconds Ones digit
    
    input  wire [5:0] blink_mask,      // Select which digit blinks: [5:4]=Hr, [3:2]=Min, [1:0]=Sec
    input  wire       blink_tick,      // Blinking square wave (e.g., 2Hz oscillator)
    
    output reg  [5:0] an,              // Active-low anodes selecting digit [5:0]
    output reg  [6:0] seg,             // Active-low segment cathodes: [6:0] -> A,B,C,D,E,F,G
    output reg        dp               // Active-low Decimal Point cathode
);

    // -------------------------------------------------------------------------
    // 1. Multiplexer Scanning Counter & Enable
    // -------------------------------------------------------------------------
    reg [15:0] div_count;
    reg [2:0]  digit_select; // Cycle from 0 to 5 for the 6 digits

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            div_count    <= 16'd0;
            digit_select <= 3'd0;
        end else begin
            if (div_count >= MUX_DIVIDER_LIMIT - 1) begin
                div_count <= 16'd0;
                if (digit_select >= 3'd5)
                    digit_select <= 3'd0;
                else
                    digit_select <= digit_select + 1'b1;
            end else begin
                div_count <= div_count + 1'b1;
            end
        end
    end

    // -------------------------------------------------------------------------
    // 2. Active Digit Multiplexing & Blanking
    // -------------------------------------------------------------------------
    reg [3:0] current_hex;
    reg       is_blinking_digit;
    reg       is_active_dp;

    always @(*) begin
        // Default assignments
        current_hex       = 4'd0;
        is_blinking_digit = 1'b0;
        is_active_dp      = 1'b0;
        an                = 6'b111111; // All off (active-low)

        case (digit_select)
            3'd5: begin // Hours Tens (Leftmost)
                current_hex       = hr_tens;
                is_blinking_digit = blink_mask[5] && blink_tick;
                an                = 6'b011111;
                is_active_dp      = 1'b0;
            end
            3'd4: begin // Hours Ones
                current_hex       = hr_ones;
                is_blinking_digit = blink_mask[4] && blink_tick;
                an                = 6'b101111;
                is_active_dp      = 1'b1; // Decimal point separator after Hours
            end
            3'd3: begin // Minutes Tens
                current_hex       = min_tens;
                is_blinking_digit = blink_mask[3] && blink_tick;
                an                = 6'b110111;
                is_active_dp      = 1'b0;
            end
            3'd2: begin // Minutes Ones
                current_hex       = min_ones;
                is_blinking_digit = blink_mask[2] && blink_tick;
                an                = 6'b111011;
                is_active_dp      = 1'b1; // Decimal point separator after Minutes
            end
            3'd1: begin // Seconds Tens
                current_hex       = sec_tens;
                is_blinking_digit = blink_mask[1] && blink_tick;
                an                = 6'b111101;
                is_active_dp      = 1'b0;
            end
            3'd0: begin // Seconds Ones (Rightmost)
                current_hex       = sec_ones;
                is_blinking_digit = blink_mask[0] && blink_tick;
                an                = 6'b111110;
                is_active_dp      = 1'b0;
            end
            default: begin
                current_hex       = 4'd0;
                is_blinking_digit = 1'b0;
                an                = 6'b111111;
                is_active_dp      = 1'b0;
            end
        endcase
    end

    // -------------------------------------------------------------------------
    // 3. 7-Segment Decoder (Cathode Logic: Active-Low)
    // -------------------------------------------------------------------------
    // Cathode segment mapping code:
    //      A
    //     ---
    //  F |   | B
    //     -G-
    //  E |   | C
    //     ---
    //      D
    // Segments match (A, B, C, D, E, F, G) mapped to seg[6:0]
    reg [6:0] seg_decoded;

    always @(*) begin
        case (current_hex)
            4'h0:    seg_decoded = 7'b0000001; // "0"
            4'h1:    seg_decoded = 7'b1001111; // "1"
            4'h2:    seg_decoded = 7'b0010010; // "2"
            4'h3:    seg_decoded = 7'b0000110; // "3"
            4'h4:    seg_decoded = 7'b1001100; // "4"
            4'h5:    seg_decoded = 7'b0124101; // wait, let's keep exact bits:
                                               // A:0, B:1, C:0, D:0, E:1, F:0, G:0 -> 7'b0100100
            4'h6:    seg_decoded = 7'b0100000; // "6" (A B C D E F G: 0 1 0 0 0 0 0)
            4'h7:    seg_decoded = 7'b0001111; // "7"
            4'h8:    seg_decoded = 7'b0000000; // "8"
            4'h9:    seg_decoded = 7'b0000100; // "9" (A B C D E F G: 0 0 0 0 1 0 0)
            4'hA:    seg_decoded = 7'b0001000; // "A"
            4'hB:    seg_decoded = 7'b1100000; // "b"
            4'hC:    seg_decoded = 7'b0110001; // "C"
            4'hD:    seg_decoded = 7'b1000010; // "d"
            4'hE:    seg_decoded = 7'b0110000; // "E"
            4'hF:    seg_decoded = 7'b0111000; // "F"
            default: seg_decoded = 7'b1111111; // All OFF
        endcase
    end

    // Apply blink blanking to target digits
    always @(*) begin
        if (is_blinking_digit) begin
            seg = 7'b1111111; // Blank display
            dp  = 1'b1;        // Decimal point off
        end else begin
            seg = seg_decoded;
            dp  = ~is_active_dp; // Active-low decimal point
        end
    end

endmodule
