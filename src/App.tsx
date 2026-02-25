import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './views/Dashboard';
import CourseView from './views/CourseView';
import ClassroomView from './views/ClassroomView';
import StudentView from './views/StudentView';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-950 text-slate-50 relative overflow-hidden">
        {/* Abstract Background decorations */}
        <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[140px] rounded-full pointer-events-none" />

        <main className="relative z-10 w-full h-full min-h-screen">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/course/:courseId" element={<CourseView />} />
            <Route path="/classroom/:classroomId" element={<ClassroomView />} />
            <Route path="/q/:questionId" element={<StudentView />} />
          </Routes>
        </main>

        {/* Footer */}
        <div className="fixed bottom-2 right-4 text-[10px] md:text-xs text-slate-500/50 z-50 pointer-events-none font-sans text-right">
          © Dr. Huang Wei Lun<br className="md:hidden" />
          <span className="hidden md:inline"> | </span>
          v26.1.0
        </div>
      </div>
    </Router>
  );
}

export default App;
