# ⏱️ VLSI-Based Digital Clock with Alarm Functionality

![Verilog](https://img.shields.io/badge/Language-Verilog-blue.svg)
![TypeScript](https://img.shields.io/badge/Engine-TypeScript-blue)
![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Environment-Node.js-339933?logo=nodedotjs&logoColor=white)

An industry-grade Virtual FPGA Lab Workstation and cycle-accurate digital engine. This project implements a fully parameterizable digital clock in Verilog, featuring advanced alarm capabilities, 12/24-hour modes, and 7-segment display multiplexing. 

To bypass the need for physical FPGA hardware, this repository includes a high-fidelity React-based EDA workspace. The simulator operates a cycle-accurate digital engine written in TypeScript that mirrors hardware Verilog registers under the hood, allowing for real-time testing of hardware phenomena like button debouncing, multiplexing rates, and alarm configurations.

---

## 📑 Table of Contents
1. [System Architecture](#-system-architecture)
2. [Hardware Modules (RTL)](#-hardware-modules-rtl)
3. [Virtual EDA Workspace](#-virtual-eda-workspace)
4. [Getting Started (Local Setup)](#-getting-started-local-setup)
5. [Usage Guide](#-usage-guide)
6. [Author](#-author)

---

## 🏗️ System Architecture

This project is divided into two distinct phases to demonstrate both strict hardware description skills and modern software engineering:

1. **Synthesizable RTL Design Specifications:** Core logic written in Verilog, designed strictly using synchronous design principles.
2. **Virtual Simulation Interface:** A React and TypeScript frontend that visually emulates physical hardware interactions, timing waveforms, and gate-level synthesis.

---

## 🛠️ Hardware Modules (RTL)

All Verilog hardware modules are modular, strictly synchronous, and located under the `/src/verilog/` directory.

* **`debounce.v` (Input Synchronization):** Features a 2-stage Flip-Flop Synchronizer to protect against metastability issues when crossing asynchronous push-button inputs into the board clock domain. This is followed by a saturated timing counter integrator to effectively filter out mechanical button chattering (bounces).
* **`seven_seg_mux.v` (Display Driver):** A synthesizable multi-digit display scanner. It cycles active-low anode select pulses (`an[5:0]`) while loading corresponding BCD digits onto shared active-low cathodes (`seg[6:0]`) fast enough to engage human Persistence of Vision (POV). It includes a 6-bit blinking mask to blank digits during configuration modes.
* **`digital_clock.v` (Top-Level Wrapper):** The master component. Contains clock divider networks generating safe `one_sec_tick` and `blink_tick` timing chains (strictly avoiding the anti-pattern of gated clocks). Handles 12/24 hour display formatting, FSM configuration modes (Normal / Time-Setting / Alarm-Setting), alarm match comparators, and snooze timers.
* **`tb_digital_clock.v` (Testbench):** A comprehensive, self-checking verification testbench. Automatically conducts 7 rigorous tests (reset logic, midnight rollovers, manual increments, alarm triggers, snooze reschedule calculations) and writes logical signal value changes into a local `.vcd` database file.
* **`synthesis.ys` (Synthesis Script):** A complete compilation script for Yosys RTL synthesis tools that maps the timing loops and registers into generic logic cells and generates a detailed area report.

---

## 💻 Virtual EDA Workspace

The front-end dashboard acts as a professional digital IC engineering workspace, divided into five specialized tabs:

### 1. Virtual FPGA Board (Digilent Basys-3 Emulation)
* **Vector Glowing Displays:** Six high-contrast, neon SVG 7-segment numerical digits that dynamically light up based on active cathode codes.
* **Scanning Pace Controller:** Toggle multiplexing frequency between standard **POV Merged (1.0 kHz)** for a steady glow, and **Slow Scan (20 Hz)** to watch the scanning anode sweep from digit to digit in slow-motion—an excellent educational visualizer.
* **Tactile Bounce Switch:** Inject high-frequency mechanical bounces on button click releases to watch the synchronizer filter out chatter on the logic trace in real-time.
* **Pacing Selectors:** Control simulation speed with Real-time Seconds, Accelerated Transitions (fast-forward to check rollovers), or Manual Step (debug cycle-by-cycle).

### 2. Logic Analyzer (GTKWave Emulation)
An interactive vertical timing waveform viewer plotting real-time logic flows. Tracks system clock oscillations (`clk`), resets (`rst_n`), raw noisy button presses, settled debounced pulses (`btn_mode_deb`), FSM code states, and anode sweeps. Hover or scroll to inspect binary values at any cycle tap.

### 3. RTL Gate Schematics
A block diagram flow tracing logical interconnections between input pads, synchronizers, timekeepers, comparators, BCD formatters, and multiplex display drivers. Clicking any block highlights its active sub-bus ports and presents the corresponding synthesizable Verilog HDL code snippet in the side panel.

### 4. Verification Testbench Terminal
An animated command-line console running `iverilog` and mock `vvp` simulation tasks. Executing the testbench outputs real-time compiler diagnostics, cycles through the 7 self-checking logic tests, and prints a `TESTBENCH PASSED: 0 errors` confirmation before initializing the waveform analyzer trace.

### 5. Lab Work Notebook
A built-in educational resource detailing key digital design guidelines. Covers Gated Clocks, Metastability mathematics, MTBF (Mean Time Between Failures), POV multiplex equations, and how synthesizers convert conditional blocks into netlists.

---

## 🚀 Getting Started (Local Setup)

This virtual environment is built with Node.js and React/Vite.

### Prerequisites
* [Node.js](https://nodejs.org/) (v16.x or higher)
* Git

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Jui-Ramteke/VLSI-Based-Digital-Clock-with-Alarm-Functionality.git](https://github.com/Jui-Ramteke/VLSI-Based-Digital-Clock-with-Alarm-Functionality.git)

2. **Navigate to the project directory:**
   ```bash
   cd VLSI-Based-Digital-Clock-with-Alarm-Functionality

3. **Install dependencies:**
   ```bash
   npm install

4. **Run the development server:**
   ```bash
   npm run dev

5. **Open your browser:**
   ```
   Navigate to http://localhost:5173 (or the port provided in your terminal) to access the Virtual FPGA Lab.

### 🕹️ Usage Guide

i) Setting the Time: Navigate to the Virtual FPGA Board. Use the Mode button to switch the FSM to Time-Setting mode. The current digit will blink (controlled by blink_tick). Use the Increment button to change the value.

ii) Testing Debounce: Turn on the "Tactile Bounce" switch. Press any input button and watch the Logic Analyzer tab to see the raw noise vs. the clean btn_mode_deb output.

iii) Viewing Multiplexing: Change the Scanning Pace Controller to Slow Scan (20 Hz) to visually understand how the seven_seg_mux cycles through the anodes.

iv) Running Tests: Open the Verification Testbench Terminal tab and click "Run Testbench" to simulate the automated .vcd generation and self-checking diagnostics.

# 👩‍💻 Author

### Jui Ramteke

Linkedin:

https://www.linkedin.com/in/jui-ramteke/


Instagram:

https://www.instagram.com/jui_ramteke_/

