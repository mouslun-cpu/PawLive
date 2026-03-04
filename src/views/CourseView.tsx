import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, ensureAuth } from '../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Plus, Trash2, ArrowLeft, Users, MonitorPlay, BarChart2, Download } from 'lucide-react';
import PackedBubbleChart from '../components/PackedBubbleChart';
import { cn } from '../lib/utils';

const generateId = () => Math.random().toString(36).substring(2, 8);

export default function CourseView() {
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();
    const [course, setCourse] = useState<any>(null);
    const [classrooms, setClassrooms] = useState<any[]>([]);
    const [allMessages, setAllMessages] = useState<any[]>([]);
    const [allAttendeesData, setAllAttendeesData] = useState<any[]>([]);
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [activeTab, setActiveTab] = useState<'classrooms' | 'analytics'>('classrooms');
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);
    const [isExportingGrades, setIsExportingGrades] = useState(false);

    // ─── Semester Final Grade Export ───────────────────────────────────────────
    const handleExportGrades = async () => {
        if (!courseId || classrooms.length === 0) return;
        setIsExportingGrades(true);
        try {
            // 1. Total course polls = sum of totalPollsCount across all classrooms
            const totalCoursePolls = classrooms.reduce(
                (sum: number, cr: any) => sum + (cr.totalPollsCount || 0), 0
            );

            // 2. Fetch attendees from every classroom concurrently
            const studentMap: Record<string, {
                name: string;
                totalVotes: number;
                totalMessages: number;
                totalSpotlights: number;
            }> = {};

            await Promise.all(classrooms.map(async (cr: any) => {
                const attendeesSnap = await getDocs(
                    collection(db, `classrooms/${cr.id}/attendees`)
                );
                attendeesSnap.docs.forEach(d => {
                    const data = d.data();
                    const uid = d.id;
                    if (!studentMap[uid]) {
                        studentMap[uid] = {
                            name: data.fullName || 'Unknown',
                            totalVotes: 0,
                            totalMessages: 0,
                            totalSpotlights: 0,
                        };
                    }
                    studentMap[uid].totalVotes += (data.voteCount || 0);
                    studentMap[uid].totalMessages += (data.messageCount || 0);
                    studentMap[uid].totalSpotlights += (data.spotlightCount || 0);
                    if (data.fullName) studentMap[uid].name = data.fullName;
                });
            }));

            // 3. Apply scoring formula (100-point scale)
            const rows = Object.values(studentMap).map(s => {
                const focusScore = totalCoursePolls === 0 ? 60
                    : Math.min((s.totalVotes / totalCoursePolls) * 60, 60);
                const participationScore = Math.min(s.totalMessages, 20);
                const spotlightScore = Math.min(s.totalSpotlights * 4, 20);
                const finalGrade = Math.round(focusScore + participationScore + spotlightScore);
                return { ...s, totalCoursePolls, finalGrade };
            }).sort((a, b) => b.finalGrade - a.finalGrade);

            // 4. Generate CSV (UTF-8 BOM for Excel compatibility)
            const headers = [
                'Student Name',
                'Total Votes Cast',
                'Total Course Polls',
                'Total Messages',
                'Total Spotlights',
                'Final Grade (100)',
            ];
            const csvContent = [
                headers.join(','),
                ...rows.map(r => [
                    `"${r.name}"`,
                    r.totalVotes,
                    r.totalCoursePolls,
                    r.totalMessages,
                    r.totalSpotlights,
                    r.finalGrade,
                ].join(','))
            ].join('\n');

            // 5. Trigger browser download
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `PawClass_FinalGrades_${course?.title || courseId}_${date}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Grade export failed', err);
            alert('CSV export failed. Please try again.');
        } finally {
            setIsExportingGrades(false);
        }
    };
    // ────────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!courseId) return;

        const fetchData = async () => {
            try {
                await ensureAuth();
                const cSnap = await getDoc(doc(db, 'courses', courseId));
                if (cSnap.exists()) {
                    setCourse({ id: courseId, ...cSnap.data() });
                }

                // Fetch classrooms
                const q = query(collection(db, 'classrooms'), where('courseId', '==', courseId));
                const crRefs = await getDocs(q);
                const crList = crRefs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => b.createdAt - a.createdAt);
                setClassrooms(crList);
            } catch (error) {
                console.error("Error fetching course data:", error);
            } finally {
                setFetching(false);
            }
        };
        fetchData();
    }, [courseId]);

    // Fetch analytical data on demand (messages + attendees, both in parallel)
    useEffect(() => {
        if (activeTab === 'analytics' && classrooms.length > 0 && allMessages.length === 0) {
            const fetchAnalytics = async () => {
                setLoadingAnalytics(true);
                try {
                    const [msgsArrays, attendeesArrays] = await Promise.all([
                        Promise.all(classrooms.map(async (cr: any) => {
                            const snap = await getDocs(collection(db, `classrooms/${cr.id}/messages`));
                            return snap.docs.map(d => ({ id: d.id, classroomTitle: cr.title, ...d.data() }));
                        })),
                        Promise.all(classrooms.map(async (cr: any) => {
                            const snap = await getDocs(collection(db, `classrooms/${cr.id}/attendees`));
                            return snap.docs.map(d => ({ uid: d.id, classroomId: cr.id, ...d.data() }));
                        }))
                    ]);
                    setAllMessages(msgsArrays.flat());
                    setAllAttendeesData(attendeesArrays.flat());
                } catch (err) {
                    console.error('Analytics fetch failed', err);
                } finally {
                    setLoadingAnalytics(false);
                }
            };
            fetchAnalytics();
        }
    }, [activeTab, classrooms, allMessages.length]);

    const statData = useMemo(() => {
        // Total polls this course — used to compute Immersion % (X-axis of Energy Map)
        const totalCoursePolls = classrooms.reduce(
            (sum: number, cr: any) => sum + (cr.totalPollsCount || 0), 0
        );

        // --- Aggregate attendee stats (votes, spotlights) by uid ---
        const attendeeAgg: Record<string, { name: string; voteCount: number; spotlightCount: number }> = {};
        allAttendeesData.forEach(a => {
            if (!attendeeAgg[a.uid]) {
                attendeeAgg[a.uid] = { name: a.fullName || '', voteCount: 0, spotlightCount: 0 };
            }
            attendeeAgg[a.uid].voteCount += (a.voteCount || 0);
            attendeeAgg[a.uid].spotlightCount += (a.spotlightCount || 0);
            if (a.fullName) attendeeAgg[a.uid].name = a.fullName;
        });

        // --- Build message stats ---
        const stats: Record<string, { id: string; name: string; value: number; messages: any[]; messageCount: number; voteCount: number; spotlightCount: number; pollParticipationRate: number }> = {};
        allMessages.forEach(m => {
            if (!stats[m.uid]) {
                stats[m.uid] = {
                    id: m.uid, name: m.senderName, value: 0,
                    messages: [], messageCount: 0, voteCount: 0, spotlightCount: 0, pollParticipationRate: 0
                };
            }
            stats[m.uid].value += 1;
            stats[m.uid].messageCount += 1;
            stats[m.uid].messages.push(m);
        });

        // --- Also include students who voted/were spotlighted but never sent a message ---
        Object.entries(attendeeAgg).forEach(([uid, agg]) => {
            if (!stats[uid]) {
                stats[uid] = { id: uid, name: agg.name, value: 0, messages: [], messageCount: 0, voteCount: 0, spotlightCount: 0, pollParticipationRate: 0 };
            }
            // Merge vote and spotlight counts from attendees (ground truth)
            stats[uid].voteCount = agg.voteCount;
            stats[uid].spotlightCount = agg.spotlightCount;
            // pollParticipationRate drives the X-axis (Immersion) on the Energy Map
            stats[uid].pollParticipationRate = totalCoursePolls > 0
                ? Math.min((agg.voteCount / totalCoursePolls) * 100, 100)
                : 0;
        });

        return Object.values(stats);
    }, [allMessages, allAttendeesData, classrooms]);

    const handleCreateClassroom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !courseId) return;

        setLoading(true);
        const classroomId = generateId();
        const newClassroom = {
            courseId,
            title,
            status: 'chat',
            activePollId: null,
            createdAt: Date.now()
        };

        try {
            await ensureAuth();
            await setDoc(doc(db, 'classrooms', classroomId), newClassroom);
            setClassrooms([{ id: classroomId, ...newClassroom }, ...classrooms]);
            setTitle('');
        } catch (error) {
            console.error("Failed to create classroom", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveClassroom = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Delete this classroom?')) return;
        try {
            await deleteDoc(doc(db, 'classrooms', id));
            setClassrooms(classrooms.filter(c => c.id !== id));
        } catch (error) {
            console.error('Delete error', error);
        }
    };

    if (fetching) return <div className="min-h-screen flex items-center justify-center bg-slate-950"><div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;
    if (!course) return <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950"><div className="glass-panel p-8 text-center text-slate-300">Course not found.</div></div>;

    return (
        <div className="flex h-screen overflow-hidden bg-slate-950 font-sans relative text-slate-50">
            {/* Sidebar Tools */}
            <div className="w-20 lg:w-64 bg-slate-900/40 backdrop-blur-2xl border-r border-white/5 flex flex-col z-20 shadow-2xl">
                <div className="p-4 lg:p-6 border-b border-white/5 flex items-center justify-center lg:justify-start">
                    <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors flex items-center gap-2">
                        <ArrowLeft size={20} />
                        <span className="hidden lg:inline font-medium">Back</span>
                    </button>
                </div>
                <div className="flex-1 p-4 lg:p-6 space-y-4">
                    <button
                        onClick={() => setActiveTab('classrooms')}
                        className={cn("w-full p-3 rounded-xl flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-3 border transition-colors", activeTab === 'classrooms' ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" : "bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 border-transparent")}
                    >
                        <Users size={20} />
                        <span className="hidden lg:inline font-bold">Classrooms</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={cn("w-full p-3 rounded-xl flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-3 border transition-colors", activeTab === 'analytics' ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" : "bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 border-transparent")}
                    >
                        <BarChart2 size={20} />
                        <span className="hidden lg:inline font-bold">Total Analytics</span>
                    </button>
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 overflow-y-auto p-6 md:p-12 relative">
                <div className="max-w-5xl mx-auto animate-slide-up">
                    <h1 className="text-4xl lg:text-5xl font-black mb-2 tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        {course.title}
                    </h1>

                    {activeTab === 'classrooms' ? (
                        <>
                            <p className="text-slate-400 mb-10 text-lg">Manage weekly classrooms and sessions.</p>

                            {/* Create Form */}
                            <div className="glass-panel p-6 mb-10 flex flex-col md:flex-row gap-4 items-end">
                                <div className="flex-1 w-full">
                                    <label className="block text-sm font-medium text-slate-300 mb-2">New Classroom Name</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        placeholder="e.g. Week 1 - Intro"
                                        className="glass-input w-full py-3"
                                    />
                                </div>
                                <button
                                    onClick={handleCreateClassroom}
                                    disabled={loading || !title.trim()}
                                    className="py-3 px-8 w-full md:w-auto rounded-xl font-bold bg-indigo-500 hover:bg-indigo-600 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30"
                                >
                                    <Plus size={20} /> Add
                                </button>
                            </div>

                            {/* Classroom Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {classrooms.length === 0 ? (
                                    <div className="col-span-full text-center p-12 glass-panel border-dashed border-white/10">
                                        <p className="text-slate-500">No classrooms yet. Create your first session above.</p>
                                    </div>
                                ) : (
                                    classrooms.map(cr => (
                                        <div key={cr.id} className="glass-panel p-6 group hover:border-indigo-500/40 transition-all flex flex-col justify-between h-52">
                                            <div className="flex justify-between items-start">
                                                <h3 className="text-xl font-bold text-slate-200 line-clamp-2">{cr.title}</h3>
                                                <button onClick={(e) => handleRemoveClassroom(cr.id, e)} className="text-slate-500 hover:text-rose-400 p-1 bg-white/5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <div className="mt-auto">
                                                <button
                                                    onClick={() => navigate(`/classroom/${cr.id}`)}
                                                    className="w-full py-3 rounded-xl bg-white/5 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-400 border border-white/5 hover:border-indigo-500/30 transition-all font-medium flex items-center justify-center gap-2"
                                                >
                                                    <MonitorPlay size={18} /> Enter Console
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="animate-fade-in mt-8">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-200">Total Course Engagement</h3>
                                    <p className="text-slate-400">Aggregated activity across all {classrooms.length} classrooms.</p>
                                </div>
                                <button
                                    onClick={handleExportGrades}
                                    disabled={isExportingGrades || classrooms.length === 0}
                                    className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50 transition-all disabled:opacity-50 shrink-0 shadow-lg shadow-emerald-500/10"
                                >
                                    <Download size={18} />
                                    {isExportingGrades ? 'Generating...' : '📥 匯出期末成績 (CSV)'}
                                </button>
                            </div>

                            {loadingAnalytics ? (
                                <div className="glass-panel h-[500px] flex items-center justify-center">
                                    <p className="animate-pulse text-indigo-400 font-bold">Aggregating thousands of data points...</p>
                                </div>
                            ) : statData.length === 0 ? (
                                <div className="glass-panel p-12 text-center text-slate-500">
                                    No chat messages recorded in any classroom yet.
                                </div>
                            ) : (
                                <PackedBubbleChart data={statData} />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// 更新到v26.2.0
