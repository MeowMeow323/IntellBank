/**
 * workspaceStyles.js
 * All inline style objects for WorkspaceContent editor.
 * Colors are bound to the Minimalist Modern token system via CSS variables
 * (React inline styles accept `var(--token)` strings).
 * Import as: import S from './workspaceStyles'
 */
const S = {
    root: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', background: 'var(--desk)', fontFamily: "'DM Sans','Segoe UI',sans-serif", overflow: 'hidden', position: 'relative' },
    empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center' },
    menuBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--paper)', borderBottom: '1px solid var(--rule)', padding: '0 12px', height: '32px', zIndex: 110, flexShrink: 0 },
    menuTab: { background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 500, padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' },
    menuTabActive: { background: 'var(--accent-soft)', color: 'var(--accent)' },
    dropdown: { position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', minWidth: '200px', padding: '4px 0', zIndex: 300 },
    dropdownItem: { display: 'block', width: '100%', background: 'transparent', border: 'none', textAlign: 'left', padding: '7px 14px', fontSize: '0.82rem', color: 'var(--text)', cursor: 'pointer' },
    toolbar: { display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap', background: 'var(--inset)', borderBottom: '1px solid var(--rule)', padding: '4px 12px', zIndex: 100, flexShrink: 0 },
    tbBtn: { background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: '4px 8px', fontSize: '0.82rem', fontWeight: 500, borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' },
    tbSel: { background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '3px', cursor: 'pointer', borderRadius: '4px', fontWeight: 500 },
    szLabel: { width: '24px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--rule)', borderRadius: '4px', padding: '1px 0' },
    div: { width: '1px', height: '18px', background: 'var(--rule)', margin: '0 3px' },
    findHud: { position: 'absolute', top: '72px', right: '280px', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', padding: '10px', display: 'flex', gap: '6px', alignItems: 'center', zIndex: 200 },
    findInput: { border: '1px solid var(--rule)', borderRadius: '4px', padding: '4px 8px', fontSize: '0.8rem', outline: 'none', width: '120px' },
    findBtn: { background: 'var(--accent)', border: 'none', color: '#fff', padding: '4px 10px', fontSize: '0.78rem', borderRadius: '4px', cursor: 'pointer' },
    body: { display: 'flex', flex: 1, overflow: 'hidden' },
    canvas: { flex: 1, overflowY: 'auto', overflowX: 'auto', background: 'var(--inset)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '32px 24px' },
    sidebar: { width: '240px', flexShrink: 0, borderLeft: '1px solid var(--rule)', background: 'var(--paper)', display: 'flex', flexDirection: 'column', overflowY: 'auto' },
    sideHdr: { background: 'var(--inset)', borderBottom: '1px solid var(--rule)', padding: '10px 14px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px' },
    label: { fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px' },
    sideSel: { width: '100%', border: '1px solid var(--rule)', borderRadius: '4px', padding: '5px', fontSize: '0.8rem', background: 'var(--paper)' },
    statusBar: { height: '26px', background: 'var(--paper)', borderTop: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: '20px', padding: '0 14px', fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, zIndex: 30 },
}

export default S
