import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, ensureAuth } from '../lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { Lock, Unlock, Users, Home, Copy, Check, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import ParticleCanvas from '../components/ParticleCanvas';
import { cn } from '../lib/utils';

const COLORS = [
    '#3b82f6', // blue-500
    '#ec4899', // pink-500
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#8b5cf6', // violet-500
    '#06b6d4', // cyan-500
];

export default function PresentationView() {
    const { questionId } = useParams<{ questionId: string }>();
    const navigate = useNavigate();
    const [question, setQuestion] = useState<any>(null);
    const [stats, setStats] = useState<any>({ counts: {}, total: 0 });
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!questionId) return;

        let unsubQ: (() => void) | undefined;
        let unsubS: (() => void) | undefined;

        const setup = async () => {
            try {
                await ensureAuth();
                const qRef = doc(db, 'questions', questionId);
                unsubQ = onSnapshot(qRef, s => { if (s.exists()) setQuestion(s.data()); });

                const sRef = doc(db, 'stats', questionId);
                unsubS = onSnapshot(sRef, s => { if (s.exists()) setStats(s.data()); });
            } catch (error) {
                console.error("Failed to authenticate or read", error);
            }
        };

        setup();

        return () => {
            if (unsubQ) unsubQ();
            if (unsubS) unsubS();
        };
    }, [questionId]);

    const toggleStatus = async () => {
        if (!questionId || !question) return;
        await ensureAuth();
        const newStatus = question.status === 'active' ? 'ended' : 'active';
        await updateDoc(doc(db, 'questions', questionId), { status: newStatus });
    };

    const handleResetVoting = async () => {
        if (!confirm("Are you sure you want to reset all votes for this question? This cannot be undone.")) return;
        if (!questionId || !question) return;

        await ensureAuth();

        // 1. Reset Stats
        const initialStats: Record<string, number> = {};
        question.options.forEach((o: any) => initialStats[o.id] = 0);
        await updateDoc(doc(db, 'stats', questionId), {
            counts: initialStats,
            total: 0
        });

        // 2. Update Question lastResetAt
        await updateDoc(doc(db, 'questions', questionId), {
            lastResetAt: Date.now()
        });
    };

    if (!question) return <div className="min-h-screen flex items-center justify-center"><div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;

    const joinUrl = `${window.location.origin}/#/q/${questionId}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex h-screen overflow-hidden bg-slate-950 font-sans relative text-slate-50">

            {/* Background Ambience */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,31,118,0.3),transparent_50%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(31,76,118,0.3),transparent_50%)] pointer-events-none" />

            {/* Sidebar / Leaderboard Column */}
            <div className="w-[400px] bg-slate-900/40 backdrop-blur-2xl border-r border-white/5 p-8 flex flex-col z-20 shadow-2xl relative">

                {/* Home Button */}
                <button
                    onClick={() => navigate('/')}
                    className="absolute top-6 left-6 p-2 rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all z-30"
                    title="Back to Dashboard"
                >
                    <Home size={20} />
                </button>

                <div className="mb-10 text-center relative group flex flex-col items-center">
                    <div className="absolute -inset-4 bg-white/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <h2 className="text-xl font-bold text-slate-400 mb-4 tracking-widest uppercase">Join to Vote</h2>

                    <div className="bg-white p-6 rounded-3xl mx-auto shadow-xl inline-block mb-6 group-hover:scale-105 transition-transform z-10 relative">
                        <QRCodeSVG value={joinUrl} size={220} includeMargin={false} />
                    </div>

                    <div
                        className="flex items-center bg-slate-800/80 rounded-2xl border border-white/10 shadow-inner overflow-hidden max-w-[320px] w-full z-10 relative group/copy cursor-pointer"
                        onClick={handleCopy}
                        title="Copy presentation link"
                    >
                        <div className="flex-1 px-4 py-3 text-sm font-medium text-ellipsis whitespace-nowrap overflow-hidden">
                            <span className="text-slate-400">{window.location.host}/#/q/</span><span className="text-indigo-400">{questionId}</span>
                        </div>
                        <div className="h-full py-3 px-4 border-l border-white/10 flex items-center justify-center bg-white/5 group-hover/copy:bg-indigo-500/20 transition-colors text-slate-400 group-hover/copy:text-indigo-300">
                            {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-center justify-center gap-4 text-slate-300 mb-8 font-mono text-3xl font-bold bg-white/5 py-6 rounded-3xl border border-white/5">
                        <Users size={32} className="text-indigo-400" />
                        <motion.span
                            key={stats.total}
                            initial={{ scale: 1.5, color: '#818cf8' }}
                            animate={{ scale: 1, color: '#cbd5e1' }}
                        >
                            {stats.total || 0}
                        </motion.span>
                        <span className="text-xl text-slate-500 uppercase tracking-widest font-sans">Votes</span>
                    </div>
                </div>

                <div className="mt-auto flex flex-col gap-3">
                    <button
                        onClick={handleResetVoting}
                        className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-lg transition-all shadow-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 hover:scale-[1.02]"
                    >
                        <RefreshCw size={24} /> Reset Voting
                    </button>
                    <button
                        onClick={toggleStatus}
                        className={cn(
                            "w-full py-5 rounded-2xl flex items-center justify-center gap-3 font-bold text-lg transition-all shadow-xl",
                            question.status === 'active'
                                ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 hover:scale-[1.02]"
                                : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 hover:scale-[1.02]"
                        )}
                    >
                        {question.status === 'active' ? (
                            <><Lock size={24} /> End Voting</>
                        ) : (
                            <><Unlock size={24} /> Resume Voting</>
                        )}
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 p-8 lg:p-12 flex flex-col relative">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-tight mb-4 z-20 text-balance">
                    {question.title}
                </h1>

                <ParticleCanvas options={question.options} questionId={questionId!} colors={COLORS} lastResetAt={question.lastResetAt} />

                {/* Floating Percentage Cards */}
                <div className="flex-1 relative z-20 flex items-end pb-8">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 w-full mt-auto">
                        {question.options.map((opt: any, idx: number) => {
                            const count = stats.counts?.[opt.id] || 0;
                            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                            const color = COLORS[idx % COLORS.length];

                            return (
                                <div key={opt.id} id={`option-card-${opt.id}`} className="glass-panel overflow-hidden relative flex flex-col h-[40vh] lg:h-[45vh] border-white/10 group">
                                    {/* Fill background strictly bounded by div */}
                                    <motion.div
                                        className="absolute bottom-0 left-0 w-full z-0 opacity-20"
                                        style={{ backgroundColor: color }}
                                        initial={{ height: '0%' }}
                                        animate={{ height: `${pct}%` }}
                                        transition={{ type: 'spring', bounce: 0, duration: 1 }}
                                    />

                                    {/* Top line highlight */}
                                    <motion.div
                                        className="absolute top-0 left-0 h-1 z-10"
                                        style={{ backgroundColor: color }}
                                        initial={{ width: '0%' }}
                                        animate={{ width: `${pct}%` }}
                                        transition={{ type: 'spring', bounce: 0, duration: 1 }}
                                    />

                                    <div className="p-6 relative z-10 flex flex-col h-full">
                                        <h3 className="text-2xl font-bold text-slate-200 line-clamp-2 leading-tight">{opt.text}</h3>

                                        <div className="mt-auto flex items-end justify-between">
                                            <div className="flex items-baseline gap-1" style={{ color }}>
                                                <motion.span
                                                    className="text-6xl font-black tracking-tighter"
                                                >
                                                    {pct}
                                                </motion.span>
                                                <span className="text-2xl font-bold">%</span>
                                            </div>
                                            <span className="text-slate-500 font-medium mb-1">{count} votes</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
