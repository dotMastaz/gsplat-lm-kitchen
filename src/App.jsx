import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GaussianSplatViewer } from './GaussianSplatViewer';

/* ─── Inline SVG Icons ────────────────────────────────────── */
const TagIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
);

const CloseIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

/* ─── URL detection helper ────────────────────────────────── */
function isURL(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/* ─── Main App ────────────────────────────────────────────── */
export default function App() {
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState(0);
    const [activeTag, setActiveTag] = useState(null);
    const [nearbyTag, setNearbyTag] = useState(null);
    const [notificationVisible, setNotificationVisible] = useState(false);
    const viewerRef = useRef(null);
    const dismissTimer = useRef(null);

    /* Gestion du zoom navigateur (High DPI / Browser Zoom) */
    useEffect(() => {
        const updateScale = () => {
            const ratio = window.devicePixelRatio || 1;
            let scale = 1;
            // Si le zoom est > 100%, on réduit l'UI
            if (ratio > 1.1) {
                // Facteur de réduction : on divise par le ratio pour "annuler" 
                // partiellement le grossissement du navigateur
                scale = Math.max(0.75, 1 / (ratio * 0.9));
            }
            document.documentElement.style.setProperty('--ui-scale', scale.toString());
        };

        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    /* When a tag is clicked or approached */
    const showNotification = useCallback((tag) => {
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        setActiveTag(tag);
        setNotificationVisible(true);
    }, []);

    /* Dismiss notification */
    const hideNotification = useCallback(() => {
        setNotificationVisible(false);
        dismissTimer.current = setTimeout(() => setActiveTag(null), 400);
    }, []);

    /* Handle proximity detection */
    const handleProximity = useCallback((tag) => {
        setNearbyTag(tag);
        if (tag) {
            showNotification(tag);
        } else {
            hideNotification();
        }
    }, [showNotification, hideNotification]);

    /* Handle tag click */
    const handleTagClick = useCallback((tag) => {
        showNotification(tag);
    }, [showNotification]);

    /* Handle loading state */
    const handleLoadProgress = useCallback((pct) => {
        setProgress(pct);
    }, []);

    const handleLoadComplete = useCallback(() => {
        setLoading(false);
    }, []);

    return (
        <div className="app-container">
            {/* ── Loading Overlay ── */}
            <div className={`loading-overlay ${!loading ? 'hidden' : ''}`}>
                <div className="loading-spinner" />
                <div className="loading-text">Chargement de la scène 3D…</div>
                <div className="loading-progress">
                    <div
                        className="loading-progress-bar"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* ── 3D Viewer ── */}
            <GaussianSplatViewer
                ref={viewerRef}
                onLoadProgress={handleLoadProgress}
                onLoadComplete={handleLoadComplete}
                onTagClick={handleTagClick}
                onProximity={handleProximity}
            />

            {/* ── Controls Hint ── */}
            {!loading && (
                <div className="controls-hint">
                    <kbd>🖱 Clic</kbd> Orbiter &nbsp;·&nbsp;
                    <kbd>Molette</kbd> Zoom &nbsp;·&nbsp;
                    <kbd>Clic droit</kbd> Déplacer &nbsp;·&nbsp;
                    Cliquez sur un <span style={{ color: 'var(--accent-hover)', fontWeight: 600 }}>●</span> tag
                </div>
            )}

            {/* ── Proximity Indicator ── */}
            <div className={`proximity-indicator ${nearbyTag ? 'visible' : ''}`}>
                <span className="proximity-dot" />
                {nearbyTag && `Proche : ${nearbyTag.label}`}
            </div>

            {/* ── Notification Panel ── */}
            <div className={`notification-panel ${notificationVisible ? 'visible' : ''}`}>
                <button
                    className="notification-close"
                    onClick={hideNotification}
                    aria-label="Fermer"
                    id="notification-close-btn"
                >
                    <CloseIcon />
                </button>

                {activeTag && (
                    <>
                        <div className="notification-header">
                            <div className="notification-icon">
                                <TagIcon />
                            </div>
                            <div>
                                <div className="notification-subtitle">Produit</div>
                                <div className="notification-title">{activeTag.label}</div>
                            </div>
                        </div>
                        <div className="notification-body">
                            {activeTag.photo && (
                                <div className="product-image-container">
                                    <img
                                        src={activeTag.photo}
                                        alt={activeTag.label}
                                        className="product-image"
                                    />
                                </div>
                            )}

                            <div className="product-info-grid">
                                <div className="info-item">
                                    <span className="info-label">Prix</span>
                                    <span className="price-tag">{activeTag.prix}</span>
                                </div>
                                <div className="info-item">
                                    <span className="info-label">Magasin</span>
                                    <span className="info-value">{activeTag.magasin}</span>
                                </div>
                                <div className="info-item">
                                    <span className="info-label">Statut</span>
                                    <div className="stock-status">
                                        <span className="stock-dot"></span>
                                        {activeTag.disponibilite}
                                    </div>
                                </div>
                            </div>

                            <div className="notification-description">
                                {isURL(activeTag.description) ? (
                                    <a
                                        href={activeTag.description}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Voir sur leroymerlin.fr ↗
                                    </a>
                                ) : (
                                    <p>{activeTag.description}</p>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
