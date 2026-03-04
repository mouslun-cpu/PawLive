import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface EnergyMapData {
    id: string;
    name: string;
    messageCount: number;
    voteCount: number;
    spotlightCount: number;
    pollParticipationRate: number; // 0-100
    messages: any[];
}

const COLORS = [
    '#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4',
    '#f43f5e', '#14b8a6', '#a855f7', '#fb923c',
];

const W = 800;
const H = 460;
const PAD = { top: 75, right: 75, bottom: 85, left: 75 }; // Increased padding to prevent clipping of large bubbles
const CW = W - PAD.left - PAD.right; // chart width
const CH = H - PAD.top - PAD.bottom; // chart height
const BASE_R = 30; // Slightly reduced to allow more room
const MAX_R = 60;  // Reduced from 76 to prevent excessive overlap and clipping

export default function PackedBubbleChart({ data }: { data: EnergyMapData[] }) {
    const [selected, setSelected] = useState<EnergyMapData | null>(null);

    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                <span className="text-5xl">⚡</span>
                <p className="font-medium text-sm">Energy Map will appear once students start participating.</p>
            </div>
        );
    }

    const maxMsgs = Math.max(...data.map(d => d.messageCount), 1);
    const maxSpotlight = Math.max(...data.map(d => d.spotlightCount), 1);

    // Map data values to SVG coordinates
    const cx = (rate: number) => PAD.left + (Math.min(rate, 100) / 100) * CW;
    const cy = (msgs: number) => PAD.top + CH - (Math.min(msgs, maxMsgs) / maxMsgs) * CH;
    const radius = (spotlight: number) => BASE_R + (spotlight / maxSpotlight) * (MAX_R - BASE_R);

    const xGrids = [25, 50, 75];
    const yGrids = [0.25, 0.5, 0.75];

    return (
        <div className="relative flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 pt-3 pb-2 shrink-0">
                <span className="text-2xl">⚡</span>
                <div>
                    <h2 className="text-lg font-black text-white leading-none">Energy Map</h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">Classroom Engagement Analytics</p>
                </div>
            </div>

            {/* SVG Chart */}
            <div className="flex-1 min-h-0 px-2">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <marker id="arrowX" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                            <path d="M0,1 L0,6 L7,3.5 z" fill="rgba(148,163,184,0.4)" />
                        </marker>
                        <marker id="arrowY" markerWidth="7" markerHeight="7" refX="3.5" refY="2" orient="auto">
                            <path d="M0,7 L7,7 L3.5,0 z" fill="rgba(148,163,184,0.4)" />
                        </marker>
                        {data.map((d, i) => (
                            <radialGradient key={`grad-${d.id}`} id={`grad-${d.id}`} cx="40%" cy="35%">
                                <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity="0.9" />
                                <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity="0.5" />
                            </radialGradient>
                        ))}
                    </defs>

                    {/* Background */}
                    <rect x={PAD.left} y={PAD.top} width={CW} height={CH}
                        fill="rgba(15,23,42,0.4)" rx="8" />

                    {/* Faint grid lines */}
                    {xGrids.map(p => (
                        <line key={`xg${p}`}
                            x1={cx(p)} y1={PAD.top} x2={cx(p)} y2={PAD.top + CH}
                            stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="5 5" />
                    ))}
                    {yGrids.map(f => (
                        <line key={`yg${f}`}
                            x1={PAD.left} y1={PAD.top + CH * (1 - f)} x2={PAD.left + CW} y2={PAD.top + CH * (1 - f)}
                            stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="5 5" />
                    ))}

                    {/* X Axis */}
                    <line x1={PAD.left} y1={PAD.top + CH}
                        x2={PAD.left + CW + 22} y2={PAD.top + CH}
                        stroke="rgba(148,163,184,0.25)" strokeWidth="1.5" markerEnd="url(#arrowX)" />
                    {/* Y Axis */}
                    <line x1={PAD.left} y1={PAD.top + CH}
                        x2={PAD.left} y2={PAD.top - 22}
                        stroke="rgba(148,163,184,0.25)" strokeWidth="1.5" markerEnd="url(#arrowY)" />

                    {/* Axis labels — abstract only */}
                    <text x={PAD.left + CW + 30} y={PAD.top + CH + 5}
                        fill="rgba(148,163,184,0.5)" fontSize="13" fontWeight="600" textAnchor="start"
                        fontFamily="sans-serif">Immersion</text>
                    <text x={PAD.left} y={PAD.top - 30}
                        fill="rgba(148,163,184,0.5)" fontSize="13" fontWeight="600" textAnchor="middle"
                        fontFamily="sans-serif">Activity</text>

                    {/* Bubbles */}
                    {data.map((d, i) => {
                        const bx = cx(d.pollParticipationRate);
                        const by = cy(d.messageCount);
                        const r = radius(d.spotlightCount);
                        const color = COLORS[i % COLORS.length];
                        const fontSize = Math.max(10, Math.min(15, r * 0.36));
                        const shortName = d.name.length > 9 ? d.name.substring(0, 9) + '…' : d.name;

                        return (
                            <g key={d.id} onClick={() => setSelected(d)} style={{ cursor: 'pointer' }}>
                                {/* Outer glow ring */}
                                <circle cx={bx} cy={by} r={r + 10}
                                    fill={color} opacity={0.08} />
                                {/* Main bubble */}
                                <circle cx={bx} cy={by} r={r}
                                    fill={`url(#grad-${d.id})`}
                                    stroke={color} strokeWidth="1.5" strokeOpacity="0.5" />
                                {/* Name */}
                                <text x={bx} y={by}
                                    textAnchor="middle" dominantBaseline="middle"
                                    fill="white" fontSize={fontSize} fontWeight="700"
                                    fontFamily="sans-serif"
                                    style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                    {shortName}
                                </text>
                                {/* Spotlight stars (if any) */}
                                {d.spotlightCount > 0 && (
                                    <text x={bx} y={by + r - 12}
                                        textAnchor="middle" dominantBaseline="middle"
                                        fontSize="10" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                        {'⭐'.repeat(Math.min(d.spotlightCount, 3))}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Message History Modal */}
            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/75 backdrop-blur-sm z-30 flex items-center justify-center p-6"
                        onClick={() => setSelected(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', bounce: 0.3 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-lg max-h-[75vh] flex flex-col shadow-2xl overflow-hidden"
                        >
                            <div className="p-5 border-b border-white/5 bg-slate-800/60 flex items-start justify-between shrink-0">
                                <div>
                                    <h3 className="font-black text-xl text-white">{selected.name}</h3>
                                    <div className="flex gap-4 mt-1.5 text-xs">
                                        <span className="text-indigo-400 font-semibold">💬 {selected.messageCount} msgs</span>
                                        <span className="text-emerald-400 font-semibold">🗳 {Math.round(selected.pollParticipationRate)}% Immersion</span>
                                        <span className="text-amber-400 font-semibold">⭐ {selected.spotlightCount} Spotlights</span>
                                    </div>
                                </div>
                                <button onClick={() => setSelected(null)}
                                    className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors mt-0.5">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                {selected.messages.length === 0 ? (
                                    <p className="text-center text-slate-500 text-sm mt-10">尚無留言紀錄</p>
                                ) : selected.messages.map((m, idx) => (
                                    <div key={idx} className="bg-white/5 rounded-xl p-4 border border-white/5">
                                        <p className="text-slate-200 text-sm leading-relaxed">{m.text}</p>
                                        <p className="text-[10px] text-slate-500 mt-2">
                                            {new Date(m.timestamp).toLocaleString()}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
