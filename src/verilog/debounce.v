// =============================================================================
// Module Name:  debounce
// Description:  VLSI-grade Button Synchronizer and Debouncing Circuit.
//               Integrates a 2-stage Flip-Flop Synchronizer to protect against
//               metastability, followed by a saturated counter integration
//               debouncer for clean, bounce-free single cycle outputs.
// =============================================================================

`timescale 1ns / 1ps

module debounce #(
    parameter integer ACTIVE_LEVEL    = 1,      // 1 = Active-High button, 0 = Active-Low
    parameter integer DEBOUNCE_COUNTS = 1250000 // Stable cycles required (e.g., 25ms @ 50MHz)
)(
    input  wire clk,         // System Clock
    input  wire rst_n,       // Asynchronous active-low reset
    input  wire btn_in,      // Asynchronous, noisy button input
    output reg  btn_out,     // Synchronized & debounced stable output
    output reg  btn_pulse    // Single-cycle active-high pulse on trigger
);

    // -------------------------------------------------------------------------
    // 1. Two-Stage D Flip-Flop Synchronizer (Handles Metastability)
    // -------------------------------------------------------------------------
    reg sync_reg1;
    reg sync_reg2;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            sync_reg1 <= ~ACTIVE_LEVEL[0];
            sync_reg2 <= ~ACTIVE_LEVEL[0];
        end else begin
            sync_reg1 <= btn_in;
            sync_reg2 <= sync_reg1;
        end
    end

    // Normalize signal to active-high internal representation
    wire btn_synced = (ACTIVE_LEVEL == 1) ? sync_reg2 : ~sync_reg2;

    // -------------------------------------------------------------------------
    // 2. Saturated Counter Debouncing Logic
    // -------------------------------------------------------------------------
    // Counter width must accommodate DEBOUNCE_COUNTS. $clog2 is not universally
    // supported in older synthesis compilers but Yosys supports it logic-wise.
    // We will use standard sized 22-bit counter capable of storing up to ~4.1 Million
    reg [21:0] count_reg;
    reg        btn_state;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            count_reg <= 22'd0;
            btn_state <= 1'b0;
        end else begin
            if (btn_synced != btn_state) begin
                // If button is in a different state from stable state, count cycles
                if (count_reg >= DEBOUNCE_COUNTS - 1) begin
                    btn_state <= btn_synced; // State settled
                    count_reg <= 22'd0;      // Reset counter
                end else begin
                    count_reg <= count_reg + 1'b1;
                end
            end else begin
                // Button matches current stable state, clear counter
                count_reg <= 22'd0;
            end
        end
    end

    // -------------------------------------------------------------------------
    // 3. Register Output & Pulse Generation (Single-Clock Pulse)
    // -------------------------------------------------------------------------
    reg btn_state_prev;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            btn_out        <= 1'b0;
            btn_state_prev <= 1'b0;
            btn_pulse      <= 1'b0;
        end else begin
            btn_out        <= btn_state;
            btn_state_prev <= btn_out;
            btn_pulse      <= btn_state && !btn_state_prev; // Detect rising edge
        end
    end

endmodule
