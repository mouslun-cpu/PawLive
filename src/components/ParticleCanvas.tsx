import { useEffect, useRef } from 'react';
import * as d3 from 'd3-force';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

interface Particle extends d3.SimulationNodeDatum {
    id: string;
    optionId: string;
    color: string;
    r: number;
}

interface ParticleCanvasProps {
    questionId: string;
    options: { id: string; text: string }[];
    colors: string[];
    lastResetAt?: number;
}

export default function ParticleCanvas({ questionId, options, colors, lastResetAt }: ParticleCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        let width = window.innerWidth;
        let height = window.innerHeight;

        const resize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * window.devicePixelRatio;
            canvas.height = height * window.devicePixelRatio;
            ctx?.scale(window.devicePixelRatio, window.devicePixelRatio);
        };
        resize();
        window.addEventListener('resize', resize);

        const nodes: Particle[] = [];

        // Calculates cluster centers based on the DOM element's position
        const getClusterCenter = (optionId: string) => {
            const el = document.getElementById(`option-card-${optionId}`);
            if (el) {
                const rect = el.getBoundingClientRect();
                return {
                    // Center X
                    x: rect.left + rect.width / 2,
                    // Center Y right in the middle
                    y: rect.top + rect.height / 2 - 20,
                };
            }
            // Fallback
            return { x: width / 2, y: height / 2 };
        };

        const simulation = d3.forceSimulation<Particle>(nodes)
            .alphaDecay(0.005) // Let it gently move for a long time
            .velocityDecay(0.25) // higher friction so bubbles stay within cards
            // Tighter collision so ~80 dots can pack into each answer card zone
            .force('collide', d3.forceCollide<Particle>().radius(d => d.r * 1.4 + 1).iterations(5))
            .force('x', d3.forceX<Particle>().x(d => getClusterCenter(d.optionId).x).strength(0.35))
            .force('y', d3.forceY<Particle>().y(d => getClusterCenter(d.optionId).y).strength(0.35));

        const render = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, width, height);

            // Dynamically update forces continuously in case the window resizes or layout shifts
            simulation.force('x', d3.forceX<Particle>().x(d => getClusterCenter(d.optionId).x).strength(0.3));
            simulation.force('y', d3.forceY<Particle>().y(d => getClusterCenter(d.optionId).y).strength(0.3));

            for (const node of nodes) {
                if (node.x === undefined || node.y === undefined) continue;

                ctx.beginPath();
                ctx.arc(node.x, node.y, node.r, 0, 2 * Math.PI);
                ctx.fillStyle = node.color;

                ctx.shadowColor = node.color;
                ctx.shadowBlur = 15;
                ctx.fill();
            }
        };

        simulation.on('tick', render);

        const streamRef = query(
            collection(db, 'streams', questionId, 'events'),
            where('timestamp', '>=', lastResetAt || 0)
        );
        const unsubscribe = onSnapshot(streamRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (!data) return;

                    const idx = options.findIndex(o => o.id === data.optionId);
                    const color = colors[idx % colors.length] || '#ffffff';

                    // Spawn randomly off-screen
                    const edge = Math.floor(Math.random() * 4);
                    let startX = 0, startY = 0;
                    if (edge === 0) { startX = Math.random() * width; startY = -100; }
                    else if (edge === 1) { startX = width + 100; startY = Math.random() * height; }
                    else if (edge === 2) { startX = Math.random() * width; startY = height + 100; }
                    else { startX = -100; startY = Math.random() * height; }

                    const newNode: Particle = {
                        id: change.doc.id,
                        optionId: data.optionId,
                        color,
                        x: startX,
                        y: startY,
                        vx: (Math.random() - 0.5) * 50,
                        vy: (Math.random() - 0.5) * 50,
                        r: Math.random() * 3 + 5 // 5-8px size - fits ~80 per card zone
                    };

                    nodes.push(newNode);
                    simulation.nodes(nodes);
                    simulation.alpha(0.8).restart();
                }
            });
        });

        return () => {
            window.removeEventListener('resize', resize);
            simulation.stop();
            unsubscribe();
        };
    }, [questionId, options, colors, lastResetAt]);

    return (
        <canvas
            ref={canvasRef}
            // Use z-50 to ensure particles float ON TOP of the cards (z-20)
            className="fixed inset-0 pointer-events-none z-50 w-full h-full drop-shadow-2xl"
        />
    );
}
