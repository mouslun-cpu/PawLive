import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, ensureAuth } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, setDoc, collection, query, orderBy, limit, getDocs, deleteDoc, increment } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Play, X, MessageSquare, Plus, Trash2, StopCircle, Maximize2, Copy, Check, PauseCircle, RotateCcw, BarChart2, Power, PowerOff, Users, ListFilter, Edit2 } from 'lucide-react';
import ParticleCanvas from '../components/ParticleCanvas';
import PackedBubbleChart from '../components/PackedBubbleChart';
import type { EnergyMapData } from '../components/PackedBubbleChart';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = [
    '#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4',
];

const generateId = () => Math.random().toString(36).substring(2, 8);

export default function ClassroomView() {
    const { classroomId } = useParams<{ classroomId: string }>();
    const navigate = useNavigate();
    const [classroom, setClassroom] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);

    // UI States
    const [pollTitle, setPollTitle] = useState('');
    const [pollOptions, setPollOptions] = useState([{ id: generateId(), text: '' }, { id: generateId(), text: '' }]);
    const [isMultipleChoice, setIsMultipleChoice] = useState(false);
    const [editingPollId, setEditingPollId] = useState<string | null>(null);
    const [focusedMessage, setFocusedMessage] = useState<any>(null);
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [activeSidebarTab, setActiveSidebarTab] = useState<'create' | 'list'>('create');

    // Data States
    const [attendeesCount, setAttendeesCount] = useState(0);
    const [attendeesData, setAttendeesData] = useState<any[]>([]);
    const [pollsList, setPollsList] = useState<any[]>([]);

    // Polling State
    const [activePoll, setActivePoll] = useState<any>(null);
    const [pollVotes, setPollVotes] = useState<any>({});

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const statData = useMemo((): EnergyMapData[] => {
        // Build message list per uid from local messages state
        const messagesByUid: Record<string, any[]> = {};
        messages.forEach(m => {
            if (!messagesByUid[m.uid]) messagesByUid[m.uid] = [];
            messagesByUid[m.uid].push(m);
        });
        const totalPolls = classroom?.totalPollsCount || 0;
        return attendeesData.map(a => ({
            id: a.id,
            name: a.fullName || 'Student',
            messageCount: a.messageCount || 0,
            voteCount: a.voteCount || 0,
            spotlightCount: a.spotlightCount || 0,
            pollParticipationRate: totalPolls > 0 ? Math.min(((a.voteCount || 0) / totalPolls) * 100, 100) : 0,
            messages: messagesByUid[a.id] || [],
        }));
    }, [attendeesData, messages, classroom]);

    useEffect(() => {
        if (!classroomId) return;
        const unsubClass = onSnapshot(doc(db, 'classrooms', classroomId), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setClassroom(data);
                if (data.activePollId) {
                    const pRef = doc(db, `classrooms/${classroomId}/polls/${data.activePollId}`);
                    onSnapshot(pRef, pSnap => {
                        if (pSnap.exists()) setActivePoll({ id: pSnap.id, ...pSnap.data() });
                    });
                    const votesRef = collection(db, `classrooms/${classroomId}/polls/${data.activePollId}/votes`);
                    onSnapshot(votesRef, vSnap => {
                        const counts: Record<string, number> = {};
                        vSnap.docs.forEach(d => {
                            const opt = d.data().selectedOption;
                            if (Array.isArray(opt)) {
                                opt.forEach((o: any) => counts[o] = (counts[o] || 0) + 1);
                            } else {
                                counts[opt] = (counts[opt] || 0) + 1;
                            }
                        });
                        setPollVotes({ counts, total: vSnap.docs.length });
                    });
                } else {
                    setActivePoll(null);
                    setPollVotes({ counts: {}, total: 0 });
                }
            }
        });
        const qChat = query(collection(db, `classrooms/${classroomId}/messages`), orderBy('timestamp', 'desc'), limit(100));
        const unsubChat = onSnapshot(qChat, (snapshot) => {
            const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
            setMessages(msgs);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });

        const qPolls = query(collection(db, `classrooms/${classroomId}/polls`), orderBy('createdAt', 'desc'));
        const unsubPolls = onSnapshot(qPolls, (snapshot) => {
            setPollsList(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubAttendees = onSnapshot(collection(db, `classrooms/${classroomId}/attendees`), (snapshot) => {
            setAttendeesCount(snapshot.docs.length);
            setAttendeesData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => { unsubClass(); unsubChat(); unsubPolls(); unsubAttendees(); };
    }, [classroomId]);

    const toggleClassroomActive = async () => {
        if (!classroomId || !classroom) return;
        const currentActive = classroom.isActive ?? true;
        await updateDoc(doc(db, 'classrooms', classroomId), { isActive: !currentActive });
    };

    const handleCopyLink = async () => {
        const url = `${window.location.origin}/#/q/${classroomId}`;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            // Fallback for browsers that block clipboard API
            const el = document.createElement('textarea');
            el.value = url;
            el.style.position = 'fixed';
            el.style.opacity = '0';
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        }
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    };

    const handleAddOption = () => setPollOptions([...pollOptions, { id: generateId(), text: '' }]);
    const handleRemoveOption = (id: string) => setPollOptions(pollOptions.filter(o => o.id !== id));
    const handleOptionChange = (id: string, text: string) => setPollOptions(pollOptions.map(o => o.id === id ? { ...o, text } : o));

    const savePoll = async () => {
        if (!pollTitle.trim() || pollOptions.some(o => !o.text.trim()) || !classroomId) return;
        try {
            await ensureAuth();
            const optionsArray = pollOptions.map(o => o.text);
            const pollData = {
                question: pollTitle,
                options: optionsArray,
                isMultipleChoice,
            };

            if (editingPollId) {
                await updateDoc(doc(db, `classrooms/${classroomId}/polls/${editingPollId}`), pollData);
            } else {
                const pollId = generateId();
                await setDoc(doc(db, `classrooms/${classroomId}/polls/${pollId}`), {
                    ...pollData,
                    status: 'draft',
                    createdAt: Date.now()
                });
                await setDoc(doc(db, 'stats', pollId), { counts: {}, total: 0 });
            }

            // reset form
            setPollTitle('');
            setPollOptions([{ id: generateId(), text: '' }, { id: generateId(), text: '' }]);
            setIsMultipleChoice(false);
            setEditingPollId(null);
            setActiveSidebarTab('list');
        } catch (error) { console.error("Failed to save poll", error); }
    };

    const handleEditPoll = (poll: any) => {
        setPollTitle(poll.question);
        setPollOptions(poll.options.map((text: string) => ({ id: generateId(), text })));
        setIsMultipleChoice(poll.isMultipleChoice || false);
        setEditingPollId(poll.id);
        setActiveSidebarTab('create');
    };

    const handleDeletePoll = async (pollId: string) => {
        if (!classroomId || !confirm('Delete this poll?')) return;
        try {
            await deleteDoc(doc(db, `classrooms/${classroomId}/polls/${pollId}`));
            await deleteDoc(doc(db, 'stats', pollId));
        } catch (error) { console.error("Failed to delete poll", error); }
    };

    const activatePoll = async (pollId: string) => {
        if (!classroomId) return;
        await updateDoc(doc(db, 'classrooms', classroomId), {
            status: 'voting',
            activePollId: pollId,
            totalPollsCount: increment(1)
        });
    };

    // Spotlight: teacher focuses a message → +1 on that student's attendee doc
    const handleSpotlight = async (message: any) => {
        if (!classroomId || !message?.uid) return;
        try {
            await updateDoc(doc(db, `classrooms/${classroomId}/attendees/${message.uid}`), {
                spotlightCount: increment(1)
            });
        } catch { /* attendee doc may not exist yet */ }
    };

    const pausePoll = async () => {
        if (!classroomId) return;
        await updateDoc(doc(db, 'classrooms', classroomId), { status: 'locked' });
    };

    const resumePoll = async () => {
        if (!classroomId) return;
        await updateDoc(doc(db, 'classrooms', classroomId), { status: 'voting' });
    };

    const restartPoll = async () => {
        if (!classroomId || !activePoll) return;
        const resetAt = Date.now();
        try {
            // 1. Delete all vote documents so students can vote again
            const votesRef = collection(db, `classrooms/${classroomId}/polls/${activePoll.id}/votes`);
            const voteSnap = await getDocs(votesRef);
            await Promise.all(voteSnap.docs.map(d => deleteDoc(d.ref)));

            // 2. Delete all stream events so particles clear
            const streamsRef = collection(db, `streams/${activePoll.id}/events`);
            const streamSnap = await getDocs(streamsRef);
            await Promise.all(streamSnap.docs.map(d => deleteDoc(d.ref)));

            // 3. Update lastResetAt on the poll (ParticleCanvas listens to this)
            await updateDoc(doc(db, `classrooms/${classroomId}/polls/${activePoll.id}`), { lastResetAt: resetAt });

            // 4. Reset stats doc
            await setDoc(doc(db, 'stats', activePoll.id), { counts: {}, total: 0 });
        } catch (err) {
            console.error('Failed to restart poll', err);
        }
    };

    const backToChat = async () => {
        if (!classroomId) return;
        await updateDoc(doc(db, 'classrooms', classroomId), { status: 'chat', activePollId: null });
    };

    if (!classroom) return <div className="min-h-screen flex items-center justify-center bg-slate-950"><div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;

    const isPollingMode = classroom.status === 'voting' || classroom.status === 'locked';
    const classIsActive = classroom.isActive ?? true;
    const joinUrl = `${window.location.origin}/#/q/${classroomId}`;

    return (
        <div className="bg-slate-950 h-screen font-sans text-slate-50 pt-8 lg:pt-10 px-2 lg:px-6 pb-0 box-border flex flex-col overflow-hidden">
            {/* Safe top padding area + inner card container */}
            <div className="flex-1 w-full bg-slate-900 rounded-t-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden flex">

                {/* Left Sidebar (25% - 300px~400px) */}
                <div className="w-[320px] lg:w-[380px] bg-slate-900/40 backdrop-blur-xl border-r border-white/5 flex flex-col z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] shrink-0">

                    <div className="p-6 pt-10 border-b border-white/5 flex flex-col shrink-0 bg-slate-900/60">
                        <div className="flex w-full gap-2 mb-6">
                            <button
                                onClick={() => navigate(`/course/${classroom.courseId}`)}
                                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all text-sm font-bold border border-white/10"
                            >
                                <ArrowLeft size={16} /> Course
                            </button>
                            <button
                                onClick={toggleClassroomActive}
                                className={cn("px-4 py-2.5 rounded-xl text-sm font-bold border transition-all shadow-sm", classIsActive ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30" : "bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30")}
                                title={classIsActive ? "End Class" : "Start Class"}
                            >
                                {classIsActive ? <Power size={18} /> : <PowerOff size={18} />}
                            </button>
                        </div>

                        <h2 className="text-2xl font-black text-center bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-4 leading-tight">{classroom.title}</h2>

                        {/* QR Code row: square QR on left, stats on right */}
                        <div className="flex items-center gap-3 bg-black/20 p-3 rounded-2xl border border-white/5">
                            {/* QR Code button - square */}
                            <button
                                onClick={() => setIsQrModalOpen(true)}
                                className="relative group bg-white p-1.5 rounded-xl shadow-lg hover:scale-105 transition-transform shrink-0"
                            >
                                <QRCodeSVG value={joinUrl} size={80} includeMargin={false} />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl transition-opacity">
                                    <Maximize2 className="text-white drop-shadow-lg" size={20} />
                                </div>
                            </button>
                            {/* Stats column beside QR */}
                            <div className="flex flex-col gap-2 flex-1 min-w-0">
                                <div className="text-slate-500 font-mono text-[9px] tracking-widest text-center">{classroomId?.toUpperCase()}</div>
                                <div className="bg-emerald-500/10 text-emerald-400 px-2 py-2 rounded-xl text-xs font-bold border border-emerald-500/20 flex items-center justify-center gap-1.5 shadow-sm">
                                    <Users size={13} /> {attendeesCount} Joined
                                </div>
                                <div className="bg-indigo-500/10 text-indigo-400 px-2 py-2 rounded-xl text-xs font-bold border border-indigo-500/20 flex items-center justify-center gap-1.5 shadow-sm">
                                    <MessageSquare size={13} /> {messages.length} Msgs
                                </div>
                            </div>
                        </div>
                    </div>

                    {!isPollingMode ? (
                        <>
                            {/* Chat Mode Sidebar: Poll Creation Form & Stats */}
                            <div className="flex flex-col flex-1 min-h-0">
                                <div className="flex border-b border-white/5 bg-slate-900/40 p-2 shrink-0">
                                    <button onClick={() => { setActiveSidebarTab('create'); setEditingPollId(null); setPollTitle(''); setPollOptions([{ id: generateId(), text: '' }, { id: generateId(), text: '' }]); setIsMultipleChoice(false); }} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors", activeSidebarTab === 'create' && !editingPollId ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300")}>
                                        <Plus size={16} className="inline mr-1" /> New Poll
                                    </button>
                                    <button onClick={() => setActiveSidebarTab('list')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors", activeSidebarTab === 'list' || editingPollId ? "bg-white/10 text-emerald-400" : "text-slate-500 hover:text-slate-300")}>
                                        <ListFilter size={16} className="inline mr-1" /> Saved ({pollsList.length})
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                    {activeSidebarTab === 'create' ? (
                                        <div className="bg-slate-800/50 rounded-2xl p-5 border border-white/5 shadow-inner">
                                            <div className="space-y-4">
                                                <input
                                                    type="text"
                                                    value={pollTitle}
                                                    onChange={e => setPollTitle(e.target.value)}
                                                    placeholder="Question?"
                                                    className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                                                />
                                                <div className="space-y-2">
                                                    {pollOptions.map((opt, idx) => (
                                                        <div key={opt.id} className="flex gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 mt-0.5">
                                                                {String.fromCharCode(65 + idx)}
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={opt.text}
                                                                onChange={e => handleOptionChange(opt.id, e.target.value)}
                                                                placeholder="Option"
                                                                className="flex-1 bg-slate-900/60 border border-white/10 rounded-xl px-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                                                            />
                                                            <button onClick={() => handleRemoveOption(opt.id)} disabled={pollOptions.length <= 2} className="p-2 text-slate-500 hover:text-rose-400 transition-colors disabled:opacity-30">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                {pollOptions.length < 6 && (
                                                    <button onClick={handleAddOption} className="w-full py-2 border border-dashed border-white/20 rounded-xl text-xs text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50 transition-colors flex items-center justify-center gap-1">
                                                        <Plus size={14} /> Add Option
                                                    </button>
                                                )}

                                                <div className="flex items-center justify-between px-2 py-1 mt-2">
                                                    <span className="text-sm font-bold text-slate-300">Multiple Choice</span>
                                                    <button
                                                        onClick={() => setIsMultipleChoice(!isMultipleChoice)}
                                                        className={cn("w-12 h-6 rounded-full transition-colors relative", isMultipleChoice ? "bg-indigo-500" : "bg-slate-700")}
                                                    >
                                                        <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", isMultipleChoice ? "translate-x-7" : "translate-x-1")} />
                                                    </button>
                                                </div>

                                                <button
                                                    onClick={savePoll}
                                                    disabled={!pollTitle.trim() || pollOptions.some(o => !o.text.trim())}
                                                    className="w-full mt-4 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex justify-center items-center gap-2"
                                                >
                                                    <Check size={16} /> {editingPollId ? 'Update Poll' : 'Save to Poll List'}
                                                </button>
                                                {editingPollId && (
                                                    <button
                                                        onClick={() => { setEditingPollId(null); setPollTitle(''); setPollOptions([{ id: generateId(), text: '' }, { id: generateId(), text: '' }]); setIsMultipleChoice(false); setActiveSidebarTab('list'); }}
                                                        className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all flex justify-center items-center gap-2"
                                                    >
                                                        Cancel Edit
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {pollsList.length === 0 ? (
                                                <p className="text-center text-slate-500 text-sm mt-10">No polls saved yet.</p>
                                            ) : (
                                                pollsList.map(p => (
                                                    <div key={p.id} className="bg-slate-800/50 border border-white/5 rounded-xl p-4 flex flex-col gap-3 group/poll relative">
                                                        <div className="absolute top-2 right-2 opacity-0 group-hover/poll:opacity-100 transition-opacity flex gap-1">
                                                            <button onClick={() => handleEditPoll(p)} className="p-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400 rounded-md transition-colors">
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button onClick={() => handleDeletePoll(p.id)} className="p-1.5 bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 rounded-md transition-colors">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                        <div className="flex justify-between items-start gap-2 pr-16">
                                                            <h4 className="font-bold text-slate-200 text-sm">{p.question}</h4>
                                                            {p.isMultipleChoice && <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/30 shrink-0">Multi</span>}
                                                        </div>
                                                        <div className="text-xs text-slate-500 flex flex-wrap gap-1">
                                                            {p.options.map((o: string, i: number) => <span key={i} className="bg-white/5 px-2 py-0.5 rounded-md">{o}</span>)}
                                                        </div>
                                                        <button
                                                            onClick={() => activatePoll(p.id)}
                                                            className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/30 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition-colors"
                                                        >
                                                            <Play fill="currentColor" size={14} /> Launch this Poll
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 border-t border-white/5 bg-slate-900/80 shrink-0">
                                    <button
                                        onClick={() => setIsStatsModalOpen(true)}
                                        className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-inner"
                                    >
                                        <BarChart2 size={20} />
                                        Gamification Dashboard
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Polling Mode Sidebar: Compact Live Chat + Controls */}
                            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                                <div className="p-4 border-b border-white/5 bg-slate-900/60 flex items-center gap-2 shrink-0">
                                    <MessageSquare size={16} className="text-indigo-400" />
                                    <h3 className="font-bold text-slate-300 text-sm">Live Chat</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar text-sm">
                                    {messages.map(m => (
                                        <div key={m.id} className="bg-white/5 p-3 rounded-xl border border-white/5">
                                            <span className="font-bold text-indigo-400 mr-2">{m.senderName}:</span>
                                            <span className="text-slate-300 break-words">{m.text}</span>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                                <div className="p-4 border-t border-white/5 bg-slate-900/80 flex flex-col gap-2 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">Poll Controls</h3>
                                    {classroom.status === 'voting' ? (
                                        <button onClick={pausePoll} className="w-full py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
                                            <PauseCircle size={18} /> End Poll (Lock)
                                        </button>
                                    ) : (
                                        <button onClick={resumePoll} className="w-full py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
                                            <Play size={18} fill="currentColor" /> Resume Poll
                                        </button>
                                    )}
                                    <button onClick={restartPoll} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
                                        <RotateCcw size={18} /> Restart Poll
                                    </button>
                                    <button onClick={backToChat} className="w-full py-3 mt-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
                                        <StopCircle size={18} /> Back to Chat
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Right Main Area (Expanding) */}
                <div className="flex-1 relative flex flex-col overflow-hidden bg-slate-900/20">
                    <div className={cn(
                        "absolute inset-0 transition-opacity duration-1000 -z-10 pointer-events-none",
                        isPollingMode ? "bg-[radial-gradient(ellipse_at_center,rgba(56,31,118,0.4),transparent_60%)]" : "bg-[radial-gradient(ellipse_at_center,rgba(31,76,118,0.2),transparent_60%)]"
                    )} />

                    {!isPollingMode ? (
                        /* Chat Mode: Huge Live Chat View */
                        <div className="flex-1 flex flex-col h-full animate-fade-in relative z-10 pt-10 lg:pt-14">
                            {/* Safer Header layout padding from top */}
                            <div className="px-8 lg:px-12 pb-6 shrink-0 flex flex-col justify-between gap-4">
                                <div>
                                    <h1 className="text-3xl lg:text-4xl font-black text-slate-200">Main Live Chat</h1>
                                    <p className="text-slate-500 mt-2">Click any message to focus and enlarge it on the main screen.</p>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto px-8 lg:px-12 pb-12 space-y-4 custom-scrollbar">
                                {!classIsActive && (
                                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-center font-bold mb-6">
                                        Class is offline! Students cannot enter or send messages.
                                    </div>
                                )}
                                {messages.map(m => (
                                    <motion.div
                                        key={m.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        onClick={() => { setFocusedMessage(m); handleSpotlight(m); }}
                                        className="group bg-slate-800/40 hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/30 p-6 rounded-2xl cursor-pointer transition-all shadow-sm hover:shadow-lg max-w-4xl"
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs ring-1 ring-indigo-500/40">
                                                {m.senderName.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-bold text-indigo-300 text-lg">{m.senderName}</span>
                                            <span className="text-sm text-slate-600">{new Date(m.timestamp).toLocaleTimeString()}</span>
                                            <span className="ml-auto opacity-0 group-hover:opacity-100 text-slate-400 text-xs bg-black/20 px-2 py-1 rounded-md transition-opacity">Click to focus</span>
                                        </div>
                                        <div className="text-slate-200 text-xl leading-relaxed">{m.text}</div>
                                    </motion.div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                        </div>
                    ) : (
                        /* Polling Mode: Question title + particle canvas + answer cards */
                        activePoll && (
                            <div className="flex-1 flex flex-col relative z-20 animate-slide-up pb-3 overflow-hidden">
                                {/* Particle canvas - fills all available space between title and cards */}
                                <ParticleCanvas
                                    options={activePoll.options.map((text: string, idx: number) => ({ id: idx.toString(), text }))}
                                    questionId={classroom.activePollId}
                                    colors={COLORS}
                                    lastResetAt={activePoll.lastResetAt ?? activePoll.createdAt}
                                />

                                {/* Bottom section: question title + answer cards — stacked at the bottom */}
                                <div className="mt-auto px-6 lg:px-10 flex flex-col gap-3 shrink-0">
                                    {/* Question title - sits directly above cards */}
                                    <div className="text-center">
                                        {classroom.status === 'locked' && (
                                            <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-500 px-4 py-1 rounded-full font-bold text-xs border border-amber-500/30 mb-1 animate-pulse">
                                                <PauseCircle size={14} /> Poll Locked
                                            </div>
                                        )}
                                        <h1 className="text-2xl lg:text-3xl font-black tracking-tight leading-tight drop-shadow-lg max-w-4xl mx-auto text-white">
                                            {activePoll.question}
                                        </h1>
                                    </div>

                                    {/* Answer cards: 2-col when 2 options (fills evenly), otherwise 3-col grid */}
                                    <div className={`grid ${activePoll.options.slice(0, 6).length === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-3 w-full z-30`}>
                                        {activePoll.options.slice(0, 6).map((optText: string, idx: number) => {
                                            const count = pollVotes.counts?.[idx] || 0;
                                            const pct = pollVotes.total > 0 ? Math.round((count / pollVotes.total) * 100) : 0;
                                            const color = COLORS[idx % COLORS.length];

                                            return (
                                                <div key={idx} id={`option-card-${idx}`} className="glass-panel overflow-hidden relative flex flex-col border-white/10 shadow-xl" style={{ minHeight: '32vh' }}>
                                                    <motion.div
                                                        className="absolute bottom-0 left-0 w-full z-0 opacity-20"
                                                        style={{ backgroundColor: color }}
                                                        initial={{ height: '0%' }}
                                                        animate={{ height: `${pct}%` }}
                                                        transition={{ type: 'spring', bounce: 0, duration: 1 }}
                                                    />
                                                    <div className="p-3 lg:p-4 relative z-10 flex flex-col h-full">
                                                        <h3 className="text-sm lg:text-base font-bold text-slate-200 line-clamp-2 leading-tight drop-shadow-md">{optText}</h3>
                                                        <div className="mt-auto flex items-end justify-between pt-2">
                                                            <div className="flex items-baseline gap-0.5 drop-shadow-lg" style={{ color }}>
                                                                <span className="text-3xl lg:text-4xl font-black">{pct}</span><span className="text-lg">%</span>
                                                            </div>
                                                            <span className="text-slate-400 text-xs font-medium bg-black/30 px-2 py-0.5 rounded-full">{count} votes</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Modals & Overlay Windows */}
            <AnimatePresence>
                {/* 1. Focused Message Modal */}
                {focusedMessage && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setFocusedMessage(null)}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 lg:p-12"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} transition={{ type: "spring", bounce: 0.4 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-slate-900 border border-indigo-500/50 p-10 lg:p-16 rounded-[2.5rem] max-w-5xl w-full shadow-[0_0_120px_rgba(99,102,241,0.25)] text-center relative"
                        >
                            <div className="absolute top-6 right-6">
                                <button onClick={() => setFocusedMessage(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="text-indigo-400 font-black text-2xl lg:text-3xl mb-8 tracking-wide">{focusedMessage.senderName}</div>
                            <div className="text-white text-4xl lg:text-6xl font-black leading-tight drop-shadow-xl break-words whitespace-pre-wrap">
                                {focusedMessage.text}
                            </div>
                            <div className="mt-12 text-slate-500 font-mono tracking-widest text-sm">
                                {new Date(focusedMessage.timestamp).toLocaleString()}
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {/* 2. QR Code Modal */}
                {isQrModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setIsQrModalOpen(false)}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-8"
                    >
                        <motion.div
                            initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white p-12 lg:p-16 rounded-[3rem] flex flex-col items-center relative shadow-[0_0_100px_rgba(255,255,255,0.1)]"
                        >
                            <button onClick={() => setIsQrModalOpen(false)} className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 hover:text-black transition-colors">
                                <X size={24} />
                            </button>
                            <h2 className="text-2xl font-black text-black mb-8">Scan to Join Live Class</h2>
                            <QRCodeSVG value={joinUrl} size={400} includeMargin={false} />
                            <div className="text-black text-3xl mt-8 font-mono font-black tracking-[0.2em]">{classroomId?.toUpperCase()}</div>

                            <button
                                onClick={handleCopyLink}
                                className="mt-10 flex items-center gap-3 text-xl text-white font-bold bg-indigo-500 hover:bg-indigo-600 px-10 py-5 rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95"
                            >
                                {copiedLink ? <Check size={28} /> : <Copy size={28} />}
                                {copiedLink ? 'Link Copied!' : 'Copy Classroom URL'}
                            </button>
                        </motion.div>
                    </motion.div>
                )}

                {/* 3. Stats Modal (Used in Chat Mode) */}
                {isStatsModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setIsStatsModalOpen(false)}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
                    >
                        <motion.div
                            onClick={e => e.stopPropagation()}
                            className="bg-slate-900 border border-emerald-500/30 rounded-3xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-[0_0_100px_rgba(16,185,129,0.15)]"
                        >
                            <div className="p-6 border-b border-white/5 bg-slate-900/60 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <BarChart2 className="text-emerald-400" size={32} />
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-200">Gamification Dashboard</h2>
                                        <p className="text-sm text-slate-400">Classroom engagement analytics</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsStatsModalOpen(false)} className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="flex-1 bg-slate-950/50 p-6 flex flex-col relative overflow-hidden">
                                <PackedBubbleChart data={statData} />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}