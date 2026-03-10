import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

/* ── Import tags data ─────────────────────────────────────── */
import tagsData from '../assets/tags.json';

/* ── Constants ────────────────────────────────────────────── */
const PROXIMITY_THRESHOLD = 1.7; // Augmenté pour plus de confort
const VISIBILITY_THRESHOLD = 2; // Augmenté car la caméra est plus centrale
const PROXIMITY_CHECK_INTERVAL = 300; // ms
const SCENE_ROTATION = [0, 1, 0, 0]; // 180° sur Y (Quaternion)

export const GaussianSplatViewer = forwardRef(function GaussianSplatViewer(
    { onLoadProgress, onLoadComplete, onTagClick, onProximity },
    ref
) {
    const containerRef = useRef(null);
    const viewerRef = useRef(null);
    const proximityTimerRef = useRef(null);
    const lastProximityTagRef = useRef(null);
    const tagElementsRef = useRef([]);
    const tagAnimFrameRef = useRef(null);
    const disposedRef = useRef(false);

    useImperativeHandle(ref, () => ({
        getViewer: () => viewerRef.current,
    }));

    useEffect(() => {
        if (!containerRef.current) return;
        disposedRef.current = false;
        const container = containerRef.current;

        // CONFIG MINIMALE COMME TEST.HTML
        const viewer = new GaussianSplats3D.Viewer({
            rootElement: container,
            cameraUp: [0, -1, 0],
            initialCameraPosition: [0, 0, 0],
            initialCameraLookAt: [0, 0, -2],
            renderMode: GaussianSplats3D.RenderMode.Always,
            sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
            logLevel: GaussianSplats3D.LogLevel.None,
        });

        viewerRef.current = viewer;

        viewer.addSplatScene('/assets/scene.ply', {
            splatAlphaRemovalThreshold: 5,
            progressiveLoad: false,
            rotation: SCENE_ROTATION,
        })
            .then(() => {
                if (disposedRef.current) return;
                viewer.start();

                if (onLoadProgress) onLoadProgress(100);
                if (onLoadComplete) onLoadComplete();

                createTagOverlays(viewer, container);
            })
            .catch((err) => {
                console.error('[GSplat] Error:', err);
                if (!disposedRef.current && onLoadComplete) onLoadComplete();
            });

        function createTagOverlays(viewer, container) {
            const tagElements = [];
            tagsData.forEach((tag) => {
                const el = document.createElement('div');
                el.className = 'tag-marker';
                // Ajout d'une transition CSS pour la fluidité
                el.style.transition = 'opacity 0.3s ease, transform 0.2s ease';
                el.innerHTML = `<div class="tag-dot"></div><div class="tag-label">${tag.label}</div>`;
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // On ne clique que si le tag est visible
                    if (parseFloat(el.style.opacity) > 0.5 && onTagClick) {
                        onTagClick(tag);
                    }
                });
                container.appendChild(el);
                tagElements.push({ el, tag });
            });
            tagElementsRef.current = tagElements;

            const tempVec = new THREE.Vector3();
            const tagPos = new THREE.Vector3();

            function updatePositions() {
                if (disposedRef.current) return;
                tagAnimFrameRef.current = requestAnimationFrame(updatePositions);
                const camera = viewer.camera;
                if (!camera) return;

                const width = container.clientWidth;
                const height = container.clientHeight;
                const camPos = camera.position;

                tagElements.forEach(({ el, tag }) => {
                    const center = tag.boundingBox.center;
                    tagPos.set(center[0], center[1], center[2]);

                    // Appliquer la rotation de la scène
                    tagPos.applyQuaternion(new THREE.Quaternion(...SCENE_ROTATION));

                    // Calcul de la distance caméra <-> tag
                    const distance = camPos.distanceTo(tagPos);

                    // Gestion de la visibilité
                    if (distance > VISIBILITY_THRESHOLD) {
                        el.style.opacity = '0';
                        el.style.pointerEvents = 'none';
                    } else {
                        el.style.opacity = '1';
                        el.style.pointerEvents = 'auto';
                    }

                    tempVec.copy(tagPos);
                    tempVec.project(camera);

                    if (tempVec.z > 1) {
                        el.style.display = 'none';
                        return;
                    }

                    const x = (tempVec.x * 0.5 + 0.5) * width;
                    const y = (-tempVec.y * 0.5 + 0.5) * height;
                    el.style.display = 'flex';
                    el.style.left = `${x}px`;
                    el.style.top = `${y}px`;
                });
            }
            updatePositions();
        }

        // Proximité avec hystérésis (entre à 1.5, sort à 2.3)
        proximityTimerRef.current = setInterval(() => {
            if (!viewerRef.current || !viewerRef.current.camera) return;

            const camPos = viewerRef.current.camera.position;
            const tagPos = new THREE.Vector3();
            const currentActive = lastProximityTagRef.current;

            if (currentActive) {
                // Si un tag est déjà actif, on vérifie s'il sort de la zone de visibilité
                const center = currentActive.boundingBox.center;
                tagPos.set(center[0], center[1], center[2]);

                // Appliquer la rotation de la scène
                tagPos.applyQuaternion(new THREE.Quaternion(...SCENE_ROTATION));

                const dist = camPos.distanceTo(tagPos);

                if (dist > VISIBILITY_THRESHOLD) {
                    lastProximityTagRef.current = null;
                    if (onProximity) onProximity(null);
                }
            } else {
                // Si aucun tag n'est actif, on cherche un tag qui entre dans la zone de proximité
                let closestTag = null;
                let closestDist = Infinity;

                for (const tag of tagsData) {
                    const center = tag.boundingBox.center;
                    tagPos.set(center[0], center[1], center[2]);

                    // Appliquer la rotation de la scène
                    tagPos.applyQuaternion(new THREE.Quaternion(...SCENE_ROTATION));

                    const dist = camPos.distanceTo(tagPos);

                    if (dist < PROXIMITY_THRESHOLD && dist < closestDist) {
                        closestDist = dist;
                        closestTag = tag;
                    }
                }

                if (closestTag) {
                    lastProximityTagRef.current = closestTag;
                    if (onProximity) onProximity(closestTag);
                }
            }
        }, PROXIMITY_CHECK_INTERVAL);

        // Ajustement de la taille au redimensionnement
        const handleResize = () => {
            // La lib gère généralement le resize d'elle même si attachée à un div
        };
        window.addEventListener('resize', handleResize);

        return () => {
            disposedRef.current = true;
            window.removeEventListener('resize', handleResize);
            clearInterval(proximityTimerRef.current);
            cancelAnimationFrame(tagAnimFrameRef.current);
            tagElementsRef.current.forEach(({ el }) => el.remove());
            if (viewerRef.current) {
                try { viewerRef.current.dispose(); } catch (e) { }
            }
        };
    }, []);

    return (
        <div
            ref={containerRef}
            id="viewer-container"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 0, // Tout en bas
                background: '#000',
                pointerEvents: 'auto' // CAPTE LES CLICS
            }}
        />
    );
});
