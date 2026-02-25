import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { db, ensureAuth } from '../lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, collection, addDoc, query, orderBy, limit, updateDoc, increment } from 'firebase/firestore';
import { CheckCircle, Send, User } from 'lucide-react';

export default function StudentView() {
    const { questionId: classroomId } = useParams<{ questionId: string }>(); // re-used parameter name for classroom
    const [fullName, setFullName] = useState(localStorage.getItem('pawlive_fullname') || '');
    const [isEntered, setIsEntered] = useState(!!localStorage.getItem('pawlive_fullname'));
    const [uid, setUid] = useState<string | null>(localStorage.getItem('pawlive_uid'));
    const [classroom, setClassroom] = useState<any>(null);
    const [poll, setPoll] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [hasVoted, setHasVoted] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Entry Gate
    const handleEnter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullName.trim() || !classroomId) return;

        try {
            const user = await ensureAuth();
            const currentUid = user.uid;

            // Register Student in Users collection
            await setDoc(doc(db, 'users', currentUid), {
                fullName,
                role: 'student',
                createdAt: Date.now()
            }, { merge: true });

            // Register Student in Classroom Attendees
            await setDoc(doc(db, `classrooms/${classroomId}/attendees/${currentUid}`), {
                fullName,
                joinedAt: Date.now()
            }, { merge: true });

            localStorage.setItem('pawlive_fullname', fullName);
            localStorage.setItem('pawlive_uid', currentUid);
            setUid(currentUid);
            setIsEntered(true);
        } catch (error) {
            console.error("Entry failed", error);
            alert("Failed to join classroom.");
        }
    };

    // Classroom & Poll Listener
    useEffect(() => {
        if (!classroomId) return;

        let unsubClass = () => { };
        let unsubChat = () => { };

        const setup = async () => {
            // Ensure we're authenticated before setting up Firestore listeners
            await ensureAuth();

            unsubClass = onSnapshot(doc(db, 'classrooms', classroomId), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setClassroom(data);

                    // If entered & active & voting, fetch the poll details
                    if (isEntered && uid && data.status === 'voting' && data.activePollId) {
                        getDoc(doc(db, `classrooms/${classroomId}/polls/${data.activePollId}`)).then(pSnap => {
                            if (pSnap.exists()) {
                                setPoll({ id: pSnap.id, ...pSnap.data() });
                            }
                        });

                        // Check if already voted
                        getDoc(doc(db, `classrooms/${classroomId}/polls/${data.activePollId}/votes/${uid}`)).then(vSnap => {
                            setHasVoted(vSnap.exists());
                        });
                    } else {
                        setPoll(null);
                        setHasVoted(false);
                    }
                }
            });

            // Listen to messages only if entered and uid exists
            if (isEntered && uid) {
                const q = query(collection(db, `classrooms/${classroomId}/messages`), orderBy('timestamp', 'asc'), limit(100));
                unsubChat = onSnapshot(q, (snapshot) => {
                    const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    setMessages(msgs);
                    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                });
            }
        };

        setup();

        return () => { unsubClass(); unsubChat(); };
    }, [isEntered, classroomId, uid]);

    // Chat
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !classroomId || !uid || classroom?.isActive === false) return;

        const msg = chatInput.trim();
        setChatInput('');

        try {
            await addDoc(collection(db, `classrooms/${classroomId}/messages`), {
                uid,
                senderName: fullName,
                text: msg,
                timestamp: Date.now()
            });
            // Track message count on attendee doc
            await updateDoc(doc(db, `classrooms/${classroomId}/attendees/${uid}`), {
                messageCount: increment(1)
            });
        } catch (err) {
            console.error("Message send failed", err);
        }
    };

    // Voting
    const handleVote = async (optionIndex: number) => {
        if (!classroomId || !poll || !uid || hasVoted) return;

        setHasVoted(true);
        try {
            // Write vote document (uses uid to naturally prevent duplicate)
            await setDoc(doc(db, `classrooms/${classroomId}/polls/${poll.id}/votes/${uid}`), {
                uid,
                voterName: fullName,
                selectedOption: optionIndex,
                timestamp: Date.now()
            });

            // Stream event for ParticleCanvas
            await setDoc(doc(db, `streams/${poll.id}/events/${uid}`), {
                optionId: optionIndex.toString(),
                timestamp: Date.now()
            });

            // Track vote count on attendee doc
            await updateDoc(doc(db, `classrooms/${classroomId}/attendees/${uid}`), {
                voteCount: increment(1)
            });

        } catch (err) {
            console.error('Vote failed', err);
            setHasVoted(false);
        }
    };

    if (!classroom) return <div className="flex min-h-screen items-center justify-center p-6 bg-slate-950"><p className="animate-pulse text-slate-400">Connecting to classroom...</p></div>;

    // Screen 0: Class is Offline
    if (classroom.isActive === false) {
        return (
            <div className="flex min-h-screen items-center justify-center p-6 bg-slate-950 relative z-10">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(244,63,94,0.15),rgba(255,255,255,0))]" />
                <div className="glass-panel p-10 max-w-sm w-full text-center flex flex-col items-center animate-slide-up relative z-10 border border-rose-500/20 shadow-[0_0_40px_rgba(244,63,94,0.1)]">
                    <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mb-6 border border-rose-500/30 text-rose-400">
                        <User size={32} />
                    </div>
                    <h1 className="text-3xl font-black text-slate-200 mb-2">Class Offline</h1>
                    <p className="text-slate-500 text-sm">The teacher has ended this session. Thank you for participating!</p>
                </div>
            </div>
        );
    }

    // Screen 1: Entry Gate
    if (!isEntered) {
        return (
            <div className="flex min-h-screen items-center justify-center p-6 bg-slate-950 relative z-10">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.2),rgba(255,255,255,0))]" />
                <div className="glass-panel p-10 max-w-sm w-full text-center flex flex-col items-center animate-slide-up">
                    <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-500/30 text-indigo-400">
                        <User size={32} />
                    </div>
                    <h1 className="text-3xl font-black text-slate-200 mb-2">Join Class</h1>
                    <p className="text-slate-500 mb-8 text-sm">Please enter your full name to proceed.</p>

                    <form onSubmit={handleEnter} className="w-full flex flex-col gap-4">
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="glass-input w-full text-center text-xl py-3"
                            placeholder="Your Full Name"
                            autoFocus
                            required
                        />
                        <button type="submit" className="w-full py-3 rounded-xl bg-indigo-500 text-white font-bold hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/30">
                            Enter Classroom
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (!classroom) return <div className="flex min-h-screen items-center justify-center p-6 bg-slate-950"><p className="animate-pulse text-slate-400">Connecting to classroom...</p></div>;

    // Screen 2: Voting Hijack
    if ((classroom.status === 'voting' || classroom.status === 'locked') && poll) {
        const isLocked = classroom.status === 'locked';

        return (
            <div className="flex flex-col min-h-screen p-6 max-w-md mx-auto relative overflow-hidden bg-slate-950">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(236,72,153,0.15),rgba(255,255,255,0))]" />
                <div className="mt-8 mb-10 text-center animate-fade-in relative z-10">
                    <div className={`inline-flex items-center justify-center px-4 py-1 mb-4 rounded-full font-bold text-xs uppercase tracking-widest border ${isLocked ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse'}`}>
                        {isLocked ? 'Poll Locked' : 'Live Poll'}
                    </div>
                    <h2 className="text-3xl font-black tracking-tight leading-snug text-slate-100">{poll.question}</h2>
                </div>

                {hasVoted ? (
                    <div className="flex-1 flex flex-col items-center justify-center animate-slide-up text-center relative z-10">
                        <div className="w-28 h-28 bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(16,185,129,0.2)]">
                            <CheckCircle size={56} />
                        </div>
                        <h3 className="text-3xl font-black mb-3 text-white">Vote Submitted</h3>
                        <p className="text-slate-400 text-lg">Look at the classroom screen.</p>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col gap-4 animate-slide-up relative z-10">
                        {poll.options.map((opt: string, idx: number) => (
                            <button
                                key={idx}
                                onClick={() => handleVote(idx)}
                                disabled={isLocked}
                                className={`glass-panel w-full p-6 text-left relative overflow-hidden group transition-all duration-300 ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(99,102,241,0.2)] hover:border-indigo-500/50'}`}
                            >
                                <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 text-slate-300 font-bold shrink-0 shadow-inner group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                        {String.fromCharCode(65 + idx)}
                                    </div>
                                    <span className="text-xl font-bold group-hover:text-white transition-colors text-slate-100">{opt}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Screen 3: Live Chat
    return (
        <div className="flex flex-col h-screen bg-slate-950 font-sans">
            {/* Header */}
            <header className="p-4 border-b border-white/5 bg-slate-900/50 backdrop-blur-md flex items-center justify-between z-20 shadow-md">
                <div>
                    <h2 className="font-bold text-slate-200">{classroom.title}</h2>
                    <p className="text-xs text-emerald-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Session</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm border border-indigo-500/30">
                    {fullName.charAt(0).toUpperCase()}
                </div>
            </header>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar flex flex-col pt-6">
                {messages.length === 0 ? (
                    <div className="m-auto text-center text-slate-500 opacity-70">
                        <p>Welcome to the classroom chat!</p>
                        <p className="text-sm mt-1">Say hi to everyone.</p>
                    </div>
                ) : (
                    messages.map((m) => {
                        const isMe = m.uid === uid;
                        return (
                            <div key={m.id} className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                                {!isMe && <span className="text-[10px] text-slate-500 mb-1 ml-1">{m.senderName}</span>}
                                <div className={`px-4 py-2.5 rounded-2xl ${isMe ? 'bg-indigo-500 text-white rounded-tr-sm' : 'glass-panel text-slate-200 rounded-tl-sm'}`}>
                                    {m.text}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <div className="p-3 border-t border-white/5 bg-slate-900/80 backdrop-blur-md">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 rounded-full bg-black/40 border border-white/10 px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        required
                    />
                    <button type="submit" disabled={!chatInput.trim()} className="w-12 h-12 flex items-center justify-center bg-indigo-500 text-white rounded-full hover:bg-indigo-600 disabled:opacity-50 transition-colors shrink-0">
                        <Send size={18} className="translate-x-[-1px] translate-y-[1px]" />
                    </button>
                </form>
            </div>
        </div>
    );
}
