import { motion } from 'framer-motion';

export interface AdventureConfig {
    isActive: boolean;
    currentEnergy: number;
    goalEnergy: number;
    mascotType: string;
    rewardType: string;
}

interface AdventureBarProps {
    config: AdventureConfig;
}

const MASCOTS: Record<string, string> = {
    cat: '🐱', dog: '🐶', hamster: '🐹', fox: '🦊', rabbit: '🐰'
};

const REWARDS: Record<string, string> = {
    food: '🐟', bone: '🦴', cheese: '🧀', treasure: '🎁', cake: '🎂'
};

export default function AdventureBar({ config }: AdventureBarProps) {
    if (!config || !config.isActive) return null;

    const progress = Math.min((config.currentEnergy / config.goalEnergy) * 100, 100);
    const mascot = MASCOTS[config.mascotType] || '🏃';
    const reward = REWARDS[config.rewardType] || '🏆';
    const isComplete = config.currentEnergy >= config.goalEnergy;

    return (
        <div className="w-full bg-slate-900/60 p-4 border-b border-indigo-500/30 flex flex-col gap-2 shrink-0 z-10 shadow-lg relative overflow-hidden">
            <div className="flex justify-between items-center text-xs font-bold text-indigo-300">
                <span className="uppercase tracking-widest text-indigo-400">Class Adventure</span>
                <span className={`px-2 py-0.5 rounded-full ${isComplete ? 'bg-amber-500 text-black' : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'}`}>
                    {config.currentEnergy} / {config.goalEnergy} Energy
                </span>
            </div>

            {/* Path */}
            <div className="relative h-12 w-full mt-2 bg-slate-900/80 rounded-full p-1 border border-indigo-500/30 overflow-hidden shadow-inner">
                {/* Nitro Progress Fill */}
                <div
                    className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-rose-500 via-fuchsia-500 to-indigo-500 animate-nitro transition-all duration-[1500ms] ease-out"
                    style={{
                        width: `${progress}%`,
                        boxShadow: '0 0 15px rgba(217, 70, 239, 0.5), inset 0 0 10px rgba(255,255,255,0.2)'
                    }}
                />

                {/* Mascot Icon */}
                <motion.div
                    className="absolute top-1/2 -mt-6 w-12 h-12 flex items-center justify-center text-4xl drop-shadow-xl z-20"
                    animate={{ left: `calc(${progress}% - 24px)` }}
                    transition={{ type: 'spring', bounce: 0.25, duration: 1.5 }}
                >
                    <motion.div
                        animate={{ y: [0, -8, 0] }}
                        transition={{ repeat: Infinity, duration: 0.5, ease: 'easeInOut' }}
                    >
                        {mascot}
                    </motion.div>
                </motion.div>

                {/* Goal Icon */}
                <div className="absolute top-1/2 right-1 -mt-5 w-10 h-10 flex items-center justify-center text-3xl drop-shadow-[0_0_15px_rgba(250,204,21,0.8)] z-10">
                    <motion.div
                        animate={isComplete ? { scale: [1, 1.2, 1], rotate: [0, 15, -15, 0] } : {}}
                        transition={{ repeat: isComplete ? Infinity : 0, duration: 1 }}
                    >
                        {reward}
                    </motion.div>
                </div>
            </div>
            {isComplete && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                    <h2 className="text-3xl font-black text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] uppercase tracking-widest animate-pulse">
                        Goal Reached!
                    </h2>
                </div>
            )}
        </div>
    );
}
