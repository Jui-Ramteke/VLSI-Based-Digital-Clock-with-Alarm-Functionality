// =============================================================================
// Component Name: WaveformViewer
// Description:    Dynamic Multi-Channel Digital Oscilloscope / GTKWave UI.
//                 Renders a scrolling state buffer of digital waveforms in SVGs.
//                 Visualizes bouncing vs debounced pulses and multiplex buses.
// =============================================================================

import React, { useState } from 'react';
import { Activity, Info, ZoomIn, ZoomOut } from 'lucide-react';
import { WaveformSnapshot } from '../vlsiclock/clock_engine';

interface WaveformViewerProps {
  history: WaveformSnapshot[];
  onClearHistory: () => void;
}

export const WaveformViewer: React.FC<WaveformViewerProps> = ({ history, onClearHistory }) => {
  const [zoom, setZoom] = useState<number>(1);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // If there is no history, show active idling status
  if (history.length === 0) {
    return (
      <div className="w-full bg-slate-950 border border-white/5 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 font-mono text-xs gap-3">
        <Activity className="w-8 h-8 text-slate-700 animate-pulse" />
        <span>No diagnostic waveforms captured yet. Engage simulation to stream logic logs.</span>
      </div>
    );
  }

  // Draw a digital signal channel
  // height: peak heights, values: array of 0s and 1s, color: stroke color
  const renderDigitalTrace = (
    values: number[],
    color: string,
    strokeWidth: number = 2,
    style: 'square' | 'analog' = 'square'
  ) => {
    const stepX = 12 * zoom; // pixels per simulation tick
    const height = 24; // trace height
    let d = '';

    values.forEach((v, idx) => {
      const x = idx * stepX;
      const y = v === 1 ? 2 : height - 2; // high or low position

      if (idx === 0) {
        d += `M ${x} ${y}`;
      } else {
        const prevY = values[idx - 1] === 1 ? 2 : height - 2;
        if (style === 'square' && prevY !== y) {
          // Vertical transition segment
          d += ` L ${x} ${prevY}`;
        }
        d += ` L ${x} ${y}`;
      }
    });

    return (
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  };

  // Draw a digital data bus (envelope with transitioning HEX label codes inside)
  const renderBusTrace = (
    labels: string[],
    color: string,
    strokeWidth: number = 1.5
  ) => {
    const stepX = 12 * zoom;
    const height = 24;
    const elements: React.JSX.Element[] = [];

    let currentVal = '';
    let startIdx = 0;

    labels.forEach((val, idx) => {
      if (idx === 0) {
        currentVal = val;
        startIdx = 0;
      } else if (val !== currentVal || idx === labels.length - 1) {
        // Render current envelope segment
        const endIdx = idx === labels.length - 1 ? idx + 1 : idx;
        const x1 = startIdx * stepX;
        const x2 = endIdx * stepX;
        const width = x2 - x1;

        if (width > 2) {
          // Bus envelope points (hexagon look)
          const midY = height / 2;
          const padding = Math.min(3, width / 4);
          const d = `M ${x1} ${midY} L ${x1 + padding} 2 L ${x2 - padding} 2 L ${x2} ${midY} L ${x2 - padding} ${height - 2} L ${x1 + padding} ${height - 2} Z`;

          elements.push(
            <g key={`bus-${startIdx}`}>
              {/* Outer boundary */}
              <path
                d={d}
                fill="rgba(30, 41, 59, 0.4)"
                stroke={color}
                strokeWidth={strokeWidth}
              />
              {/* Value descriptor text */}
              {width > 35 && (
                <text
                  x={x1 + width / 2}
                  y={midY + 4}
                  fill="#ffffff"
                  fontSize="8px"
                  fontFamily="monospace"
                  textAnchor="middle"
                  className="font-semibold select-none"
                >
                  {currentVal}
                </text>
              )}
            </g>
          );
        }

        currentVal = val;
        startIdx = idx;
      }
    });

    return <g id="bus_segments">{elements}</g>;
  };

  const steps = history.map((_, i) => i);
  const stepX = 12 * zoom;
  const totalWidth = history.length * stepX;

  // Compile individual signals arrays
  const clkSignals = history.map(s => s.clk);
  const rstSignals = history.map(s => s.rst_n);
  const modeRawSignals = history.map(s => s.btn_mode_raw);
  const modeDebSignals = history.map(s => s.btn_mode_deb);
  const incRawSignals = history.map(s => s.btn_inc_raw);
  const incDebSignals = history.map(s => s.btn_inc_deb);
  const secondTickSignals = history.map(s => s.one_sec_tick);
  const buzzerSignals = history.map(s => s.buzzer);
  
  // Convert Hex bits masks to binary strings
  const an0Signals = history.map(s => (s.an_bus & 1) ? 0 : 1); // active low inverted for high trigger
  const an1Signals = history.map(s => (s.an_bus & 2) ? 0 : 1);
  const an2Signals = history.map(s => (s.an_bus & 4) ? 0 : 1);
  const an3Signals = history.map(s => (s.an_bus & 8) ? 0 : 1);
  const an4Signals = history.map(s => (s.an_bus & 16) ? 0 : 1);
  const an5Signals = history.map(s => (s.an_bus & 32) ? 0 : 1);

  const timeLabels = history.map(s => s.time_val);
  const stateLabels = history.map(s => s.state_name);

  // Waves list config
  const signalTracks = [
    { name: 'clk', type: 'digital', data: clkSignals, color: '#64748b' },
    { name: 'rst_n', type: 'digital', data: rstSignals, color: '#ef4444' },
    { name: 'btn_mode_raw (noisy)', type: 'digital', data: modeRawSignals, color: '#f59e0b', stroke: 1.5 },
    { name: 'btn_mode_deb', type: 'digital', data: modeDebSignals, color: '#10b981', stroke: 2.5 },
    { name: 'btn_inc_raw (noisy)', type: 'digital', data: incRawSignals, color: '#f59e0b', stroke: 1.5 },
    { name: 'btn_inc_deb', type: 'digital', data: incDebSignals, color: '#10b981', stroke: 2.5 },
    { name: 'one_sec_tick', type: 'digital', data: secondTickSignals, color: '#3b82f6' },
    { name: 'time_bus[23:0]', type: 'bus', data: timeLabels, color: '#10b981' },
    { name: 'clock_state[2:0]', type: 'bus', data: stateLabels, color: '#a855f7' },
    { name: 'buzzer_out', type: 'digital', data: buzzerSignals, color: '#ef4444', stroke: 3 },
    { name: 'anode_sel[5] (H tens)', type: 'digital', data: an5Signals, color: '#38bdf8' },
    { name: 'anode_sel[4] (H ones)', type: 'digital', data: an4Signals, color: '#38bdf8' },
    { name: 'anode_sel[3] (M tens)', type: 'digital', data: an3Signals, color: '#38bdf8' },
    { name: 'anode_sel[2] (M ones)', type: 'digital', data: an2Signals, color: '#38bdf8' },
    { name: 'anode_sel[1] (S tens)', type: 'digital', data: an1Signals, color: '#38bdf8' },
    { name: 'anode_sel[0] (S ones)', type: 'digital', data: an0Signals, color: '#38bdf8' },
  ];

  return (
    <div className="w-full bg-slate-950 border border-white/5 rounded-xl p-5 md:p-6 flex flex-col gap-4 relative overflow-hidden" id="waveform_viewer">
      
      {/* Waveform Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-digital-green" />
          <h3 className="font-display font-bold text-white text-sm">Logic Logic Analyzer (GTKWave Emulation)</h3>
        </div>
        
        {/* Controls */}
        <div className="flex gap-2 font-mono text-[10px]">
          <button
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            className="flex items-center gap-1 bg-white/5 hover:bg-white/10 text-slate-300 px-2 py-1 rounded cursor-pointer transition-all border border-white/5"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" /> Out
          </button>
          <button
            onClick={() => setZoom(Math.min(3, zoom + 0.25))}
            className="flex items-center gap-1 bg-white/5 hover:bg-white/10 text-slate-300 px-2 py-1 rounded cursor-pointer transition-all border border-white/5"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" /> In
          </button>
          <button
            onClick={onClearHistory}
            className="bg-red-950/40 hover:bg-red-950/60 text-red-300 px-2 py-1 rounded border border-red-900/40 cursor-pointer transition-all"
          >
            Clear Buffer
          </button>
        </div>
      </div>

      {/* Main Waveform Grid Layout */}
      <div className="grid grid-cols-12 gap-0 border border-white/5 rounded-lg overflow-hidden bg-slate-900/30">
        
        {/* Wire Labels Sidebar (left 4cols) */}
        <div className="col-span-3 border-r border-white/5 flex flex-col">
          {/* Header spacer block */}
          <div className="h-8 bg-slate-950/50 border-b border-white/5 flex items-center px-3 font-mono text-[9px] text-slate-500 font-bold">
            SIGNAL PIN NAME
          </div>
          {signalTracks.map((tr, idx) => (
            <div
              key={`label-${idx}`}
              className="h-[36px] flex items-center px-3 font-mono text-[9.5px] font-medium border-b border-white/5 py-1 select-none transition-colors"
              style={{
                color: tr.color,
                backgroundColor: hoverIndex !== null ? 'rgba(255,255,255,0.01)' : 'transparent',
              }}
            >
              <span className="truncate">{tr.name}</span>
            </div>
          ))}
        </div>

        {/* Scrollable Oscilloscope Screen (right 9cols) */}
        <div
          className="col-span-9 overflow-x-auto flex flex-col relative"
          style={{ cursor: 'crosshair' }}
          id="oscilloscope_screen"
        >
          {/* Timeline Rulers */}
          <div className="h-8 bg-slate-950/50 border-b border-white/5 flex items-center flex-shrink-0 relative select-none">
            {/* Background ticks */}
            <svg className="absolute inset-0 h-full w-full" width={totalWidth} height="32">
              {steps.map((st) => (
                st % 10 === 0 && (
                  <g key={`tick-${st}`}>
                    <line
                      x1={st * stepX}
                      y1="22"
                      x2={st * stepX}
                      y2="32"
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth="1"
                    />
                    <text
                      x={st * stepX + 3}
                      y="18"
                      fontSize="7.5px"
                      fill="#91a3b8"
                      fontFamily="monospace"
                    >
                      +{st}t
                    </text>
                  </g>
                )
              ))}
            </svg>
          </div>

          {/* SVG Oscilloscope channels block */}
          <div className="relative flex-shrink-0" style={{ width: totalWidth || '100%' }}>
            
            {/* Column Selector Overlay on hover */}
            {hoverIndex !== null && hoverIndex < history.length && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none bg-white/5 border-x border-white/20 z-10 transition-all"
                style={{
                  left: hoverIndex * stepX,
                  width: stepX,
                }}
              />
            )}

            {/* Render traces */}
            {signalTracks.map((tr, idx) => (
              <div
                key={`track-${idx}`}
                className="h-[36px] border-b border-white/5 relative flex items-center py-1 transition-colors hover:bg-white/5"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const tickIndex = Math.floor(x / stepX);
                  if (tickIndex >= 0 && tickIndex < history.length) {
                    setHoverIndex(tickIndex);
                  }
                }}
                onMouseLeave={() => setHoverIndex(null)}
              >
                {/* Horizontal reference guidelines */}
                <div className="absolute left-0 right-0 h-[1px] bg-white/2 pointer-events-none" style={{ top: '18px' }} />
                
                {/* Channel SVG drawer */}
                <svg
                  width={totalWidth}
                  height="24"
                  className="overflow-visible pointer-events-none absolute left-0"
                >
                  {tr.type === 'digital' ? (
                    renderDigitalTrace(tr.data as number[], tr.color, tr.stroke || 2)
                  ) : (
                    renderBusTrace(tr.data as string[], tr.color)
                  )}
                </svg>

              </div>
            ))}
          </div>

        </div>

      </div>

      {/* Logic inspector tooltip */}
      {hoverIndex !== null && hoverIndex < history.length && (
        <div className="p-3 bg-slate-900 border border-white/10 rounded-lg flex flex-wrap gap-4 font-mono text-[10px] text-slate-300 align-center transition-opacity" id="logic_tooltip">
          <span className="flex items-center gap-1.5 font-bold text-digital-green">
            <Info className="w-3.5 h-3.5" /> SNAPSHOT T+{(hoverIndex)}t:
          </span>
          <span>Time: <strong className="text-white">{history[hoverIndex].time_val}</strong></span>
          <span>Buzzer: <strong className={`${history[hoverIndex].buzzer ? 'text-digital-red' : 'text-slate-500'}`}>{history[hoverIndex].buzzer ? '1/ON' : '0/OFF'}</strong></span>
          <span>Anodes: <strong className="text-digital-blue">6'b{history[hoverIndex].an_bus.toString(2).padStart(6, '0')}</strong></span>
          <span>Cathodes: <strong className="text-slate-400">7'h{history[hoverIndex].seg_bus.toString(16).toUpperCase()}</strong></span>
          <span>State: <strong className="text-purple-400">{history[hoverIndex].state_name}</strong></span>
        </div>
      )}

      {/* Static help metadata */}
      <div className="flex gap-2 text-[9.5px] font-mono text-slate-500 mt-1">
        <span className="text-digital-amber">Note:</span>
        <span>A bouncy button creates high/low transitions before stabilizing. Observe how <strong>btn_mode_deb</strong> locks on clean high signals only after 8 clock cycles stable integrator consensus!</span>
      </div>

    </div>
  );
};
