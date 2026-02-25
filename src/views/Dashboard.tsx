import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, ensureAuth } from '../lib/firebase';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Plus, Trash2, Library, Lock, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

const generateId = () => Math.random().toString(36).substring(2, 8);

export default function Dashboard() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('pawlive_admin_auth') === '1004');
    const [passwordInput, setPasswordInput] = useState('');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);
    const [courses, setCourses] = useState<any[]>([]);
    const [fetchingList, setFetchingList] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                await ensureAuth();
                const ids: string[] = JSON.parse(localStorage.getItem('pawlive_my_courses') || '[]');
                const cList = [];
                for (let i = ids.length - 1; i >= 0; i--) {
                    const snap = await getDoc(doc(db, 'courses', ids[i]));
                    if (snap.exists()) {
                        cList.push({ id: ids[i], ...snap.data() });
                    }
                }
                setCourses(cList);
            } catch (err) {
                console.error("Failed to fetch courses", err);
            } finally {
                setFetchingList(false);
            }
        };
        if (isAuthenticated) fetchCourses();
    }, [isAuthenticated]);

    const handleCreateCourse = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        setLoading(true);
        const courseId = generateId();
        const user = await ensureAuth();

        try {
            await setDoc(doc(db, 'courses', courseId), {
                title,
                teacherId: user.uid,
                createdAt: Date.now()
            });

            const ids: string[] = JSON.parse(localStorage.getItem('pawlive_my_courses') || '[]');
            if (!ids.includes(courseId)) {
                ids.push(courseId);
                localStorage.setItem('pawlive_my_courses', JSON.stringify(ids));
            }

            navigate(`/course/${courseId}`);
        } catch (error: any) {
            console.error('Failed to create course', error);
            alert(`Error creating course: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveCourse = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to permanently delete this course and all its classrooms?')) return;

        try {
            await ensureAuth();
            await deleteDoc(doc(db, 'courses', id));
            // Note: Cloud function or manual cascading delete for classrooms/messages could be handled here in a real app.

            const ids: string[] = JSON.parse(localStorage.getItem('pawlive_my_courses') || '[]');
            const newIds = ids.filter(cId => cId !== id);
            localStorage.setItem('pawlive_my_courses', JSON.stringify(newIds));
            setCourses(prev => prev.filter(c => c.id !== id));
        } catch (error) {
            console.error('Failed to delete course', error);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="flex min-h-screen items-center justify-center p-6 bg-transparent relative z-10">
                <div className="glass-panel p-10 max-w-sm w-full text-center flex flex-col items-center animate-slide-up">
                    <div className="w-16 h-16 bg-slate-800/80 rounded-full flex items-center justify-center mb-6 shadow-inner border border-white/5 text-slate-400">
                        <Lock size={32} />
                    </div>
                    <h1 className="text-3xl font-black text-slate-200 mb-2">Teacher Login</h1>
                    <p className="text-slate-500 mb-8 text-sm">Please enter the security PIN to access the dashboard.</p>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        if (passwordInput === '1004') {
                            sessionStorage.setItem('pawlive_admin_auth', '1004');
                            setIsAuthenticated(true);
                        } else {
                            alert('Incorrect PIN');
                            setPasswordInput('');
                        }
                    }} className="w-full flex flex-col gap-4">
                        <input
                            type="password"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            className="glass-input w-full text-center text-xl tracking-widest py-3"
                            placeholder="••••"
                            autoFocus
                        />
                        <button type="submit" className="w-full py-3 rounded-xl bg-indigo-500/20 text-indigo-400 font-bold hover:bg-indigo-500/30 transition-colors border border-indigo-500/20 hover:border-indigo-500/40">
                            Enter
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-6 bg-transparent">
            <div className="flex flex-col md:flex-row gap-6 w-full max-w-5xl animate-slide-up">

                {/* Create Course Area */}
                <div className="glass-panel flex-1 p-8 md:p-12">
                    <div className="mb-10 text-center relative">
                        <h1 className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-5xl md:text-6xl font-black text-transparent mb-4 tracking-tight">
                            PawLive
                        </h1>
                        <p className="text-slate-400 text-lg">Interactive Learning & Analytics</p>
                    </div>

                    <form onSubmit={handleCreateCourse} className="space-y-8 mt-12">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Course Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Advanced Project Management"
                                className="glass-input w-full text-xl py-4"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !title.trim()}
                            className="w-full py-4 text-xl mt-4 rounded-xl font-bold transition-all shadow-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create Course'}
                        </button>
                    </form>
                </div>

                {/* Course List */}
                <div className="glass-panel w-full md:w-96 flex flex-col p-6 h-[80vh] md:h-auto overflow-hidden">
                    <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10 text-slate-300">
                        <Library size={20} className="text-indigo-400" />
                        <h2 className="font-bold text-lg">My Courses</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                        {fetchingList ? (
                            <p className="text-slate-500 text-sm animate-pulse text-center mt-10">Loading courses...</p>
                        ) : courses.length === 0 ? (
                            <div className="text-center mt-10 text-slate-500 text-sm">
                                <p>No courses found.</p>
                                <p className="mt-2 text-xs opacity-70">Create a course to get started.</p>
                            </div>
                        ) : (
                            courses.map(c => (
                                <div
                                    key={c.id}
                                    onClick={() => navigate(`/course/${c.id}`)}
                                    className="bg-white/5 border border-white/5 rounded-xl p-4 transition-all hover:border-indigo-500/30 hover:bg-white/10 cursor-pointer group"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-slate-200 line-clamp-2 leading-tight pr-4">
                                            {c.title}
                                        </h3>
                                        <button
                                            onClick={(e) => handleRemoveCourse(c.id, e)}
                                            className="p-1.5 text-slate-500 hover:text-rose-400 bg-black/20 hover:bg-rose-500/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <div className="flex items-center text-xs text-indigo-400 font-medium">
                                        Manage Classrooms <ChevronRight size={14} className="ml-1" />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
