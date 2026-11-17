import React, { useEffect, useMemo, useState } from 'react';
import { LETTERS_BUCKET, supabase } from './lib/supabase.js';

const EMPTY_FORM = { title: '', body: '', file: null };
const ACCEPTED_FILES = '.pdf,.doc,.docx,.odt,.txt,.rtf,.jpg,.jpeg,.png,.webp,.gif';
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,23}$/;
const LOGO_PATH = `${import.meta.env.BASE_URL}logo.gif`;

function usernameToAuthEmail(username) {
  return `${username.toLowerCase()}@users.carwed.invalid`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [letters, setLetters] = useState([]);
  const [lettersLoading, setLettersLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isWriting, setIsWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('login');

  const isAdmin = session?.user?.app_metadata?.role === 'admin';
  const selectedLetter = letters.find((letter) => letter.id === selectedId) ?? null;

  const visibleLetters = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    if (!query) return letters;
    return letters.filter((letter) =>
      `${letter.title} ${letter.body}`.toLocaleLowerCase('es').includes(query),
    );
  }, [letters, search]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setError('');
      setNotice('');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || !supabase) {
      setLetters([]);
      setSelectedId(null);
      return;
    }

    let active = true;
    setLettersLoading(true);
    supabase
      .from('letters')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setLetters(data);
          setSelectedId((current) => (
            current && data.some((letter) => letter.id === current)
              ? current
              : data[0]?.id ?? null
          ));
        }
        setLettersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  async function signIn(event) {
    event.preventDefault();
    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError('El usuario debe tener entre 3 y 24 caracteres: letras, números, punto, guion o guion bajo.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToAuthEmail(normalizedUsername),
      password,
    });
    if (signInError) setError(signInError.message);
    setBusy(false);
  }

  async function signUp(event) {
    event.preventDefault();
    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError('El usuario debe tener entre 3 y 24 caracteres: letras, números, punto, guion o guion bajo.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: usernameToAuthEmail(normalizedUsername),
      password,
      options: { data: { username: normalizedUsername } },
    });
    if (signUpError) {
      setError(signUpError.message);
    } else if (data.session) {
      setNotice('Tu cuenta está lista. Ya puedes leer las cartas.');
    } else {
      setError('Supabase todavía exige confirmar un correo. La persona administradora debe desactivar la confirmación de correo antes de crear cuentas.');
    }
    setBusy(false);
  }

  function switchAuthMode(mode) {
    setAuthMode(mode);
    setError('');
    setNotice('');
  }

  async function signOut() {
    setError('');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  function startNewLetter() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setIsWriting(true);
    setError('');
    setNotice('');
  }

  function startEditing(letter) {
    setForm({ title: letter.title, body: letter.body, file: null });
    setEditingId(letter.id);
    setIsWriting(true);
    setError('');
    setNotice('');
  }

  function cancelWriting() {
    setIsWriting(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  async function saveLetter(event) {
    event.preventDefault();
    if (!supabase || !isAdmin) return;

    setBusy(true);
    setError('');
    setNotice('');
    let uploadedPath = null;
    try {
      let attachmentPath = editingId
        ? letters.find((letter) => letter.id === editingId)?.attachment_path ?? null
        : null;
      let attachmentName = editingId
        ? letters.find((letter) => letter.id === editingId)?.attachment_name ?? null
        : null;

      if (form.file) {
        const safeName = form.file.name.replace(/[^\w.-]/g, '_');
        uploadedPath = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(LETTERS_BUCKET)
          .upload(uploadedPath, form.file, { upsert: false });
        if (uploadError) throw uploadError;
        attachmentPath = uploadedPath;
        attachmentName = form.file.name;
      }

      const letterData = {
        title: form.title.trim(),
        body: form.body.trim(),
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
        updated_at: new Date().toISOString(),
      };

      const query = editingId
        ? supabase.from('letters').update(letterData).eq('id', editingId)
        : supabase.from('letters').insert(letterData);
      const { data, error: saveError } = await query.select().single();
      if (saveError) {
        if (uploadedPath) {
          const { error: cleanupError } = await supabase.storage.from(LETTERS_BUCKET).remove([uploadedPath]);
          if (cleanupError) {
            throw new Error(`${saveError.message} Además, no se pudo limpiar el archivo subido: ${cleanupError.message}`);
          }
        }
        throw saveError;
      }

      setLetters((current) => [
        data,
        ...current.filter((letter) => letter.id !== data.id),
      ]);
      setSelectedId(data.id);
      setIsWriting(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setNotice(editingId ? 'La carta se actualizó.' : 'La carta se guardó.');
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar la carta.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteLetter(letter) {
    if (!supabase || !isAdmin || !window.confirm(`¿Eliminar «${letter.title}»? Esta acción no se puede deshacer.`)) {
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    const { error: deleteError } = await supabase.from('letters').delete().eq('id', letter.id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setLetters((current) => current.filter((item) => item.id !== letter.id));
      setSelectedId((current) => current === letter.id
        ? letters.find((item) => item.id !== letter.id)?.id ?? null
        : current);
      setNotice('La carta se eliminó.');
      if (letter.attachment_path) {
        const { error: storageError } = await supabase.storage
          .from(LETTERS_BUCKET)
          .remove([letter.attachment_path]);
        if (storageError) setError(`La carta se eliminó, pero no se pudo borrar su archivo: ${storageError.message}`);
      }
    }
    setBusy(false);
  }

  async function openAttachment(letter) {
    if (!supabase || !letter.attachment_path) return;
    setError('');
    const { data, error: linkError } = await supabase.storage
      .from(LETTERS_BUCKET)
      .createSignedUrl(letter.attachment_path, 60);
    if (linkError) {
      setError(linkError.message);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  if (!supabase) {
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <img className="brand-logo" src={LOGO_PATH} alt="Logo de Cartas" />
          <p className="eyebrow">ARCHIVO PRIVADO</p>
          <h1>Conecta tu espacio</h1>
          <p>Agrega la URL y la clave pública de tu proyecto Supabase en un archivo <code>.env</code>.</p>
          <pre>VITE_SUPABASE_URL=...{'\n'}VITE_SUPABASE_ANON_KEY=...</pre>
          <p className="setup-hint">Luego configura las tablas y permisos con <code>supabase/schema.sql</code>.</p>
        </div>
      </main>
    );
  }

  if (authLoading) {
    return <main className="loading-screen"><span className="loader" />Cargando tu archivo…</main>;
  }

  if (!session) {
    return (
      <main className="login-screen">
        <section className="login-art" aria-label="Archivo de cartas">
          <div className="art-top"><img className="brand-logo" src={LOGO_PATH} alt="" /><span>UN LUGAR PARA TUS PALABRAS</span></div>
          <div className="letter-illustration" aria-hidden="true">
            <div className="paper paper-back" />
            <div className="paper paper-front">
              <span className="paper-date">PARA RECORDAR</span>
              <span className="paper-line long" />
              <span className="paper-line" />
              <span className="paper-line medium" />
              <span className="paper-line long" />
              <span className="paper-line short" />
              <span className="paper-sign">Con cariño,</span>
            </div>
            <span className="art-sparkle sparkle-one">✳</span>
            <span className="art-sparkle sparkle-two">✳</span>
          </div>
          <div className="art-caption">
            <p className="eyebrow">CADA CARTA GUARDA ALGO</p>
            <h2>Palabras que<br />merecen quedarse.</h2>
            <p>Un archivo para guardar, cuidar y volver a leer tus cartas.</p>
          </div>
        </section>
        <section className="login-panel">
          <div className="login-form-wrap">
            <p className="eyebrow">{authMode === 'login' ? 'BIENVENIDO/A DE VUELTA' : 'ÚNETE AL ARCHIVO'}</p>
            <h1>{authMode === 'login' ? 'Entra a tu archivo' : 'Crea tu cuenta'}</h1>
            <p className="login-subtitle">
              {authMode === 'login'
                ? 'Inicia sesión para leer las cartas que se han guardado.'
                : 'Regístrate para leer las cartas. Las cuentas nuevas tienen acceso de solo lectura.'}
            </p>
            <form onSubmit={authMode === 'login' ? signIn : signUp} className="login-form">
              <label htmlFor="username">Nombre de usuario</label>
                <input id="username" type="text" autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,23}" title="Usa de 3 a 24 letras, números, puntos, guiones o guiones bajos." value={username} onChange={(event) => setUsername(event.target.value)} required />
              <label htmlFor="password">Contraseña</label>
              <input id="password" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={authMode === 'signup' ? 6 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} required />
              {error && <p className="message error-message" role="alert">{error}</p>}
              {notice && <p className="message success-message" role="status">{notice}</p>}
              <button className="primary-button login-button" type="submit" disabled={busy}>
                {busy
                  ? (authMode === 'login' ? 'Entrando…' : 'Creando cuenta…')
                  : (authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta')} <span aria-hidden="true">→</span>
              </button>
            </form>
            <p className="auth-switch">
              {authMode === 'login' ? '¿Aún no tienes cuenta?' : '¿Ya tienes una cuenta?'}{' '}
              <button type="button" onClick={() => switchAuthMode(authMode === 'login' ? 'signup' : 'login')}>
                {authMode === 'login' ? 'Regístrate' : 'Inicia sesión'}
              </button>
            </p>
            <p className="login-footnote">Todas las cuentas nuevas pueden leer las cartas. Solo la persona administradora puede crear o modificar contenido.</p>
          </div>
          <span className="login-copyright">UN ESPACIO PRIVADO PARA LEER</span>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#" onClick={(event) => { event.preventDefault(); setIsWriting(false); setSelectedId(letters[0]?.id ?? null); }}>
          <img className="brand-logo small-logo" src={LOGO_PATH} alt="" />
          <span>cartas<span className="wordmark-dot">.</span></span>
        </a>
        <div className="topbar-right">
          <span className="user-email">{session.user.user_metadata?.username ?? 'Administrador/a'}</span>
          <button className="text-button" onClick={signOut}>Cerrar sesión <span aria-hidden="true">↗</span></button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <div>
              <p className="eyebrow">TU COLECCIÓN</p>
              <h1>Las cartas</h1>
            </div>
            {isAdmin && (
              <button className="add-button" onClick={startNewLetter} aria-label="Escribir una carta" title="Escribir una carta">+</button>
            )}
          </div>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input aria-label="Buscar cartas" placeholder="Buscar cartas…" value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">×</button>}
          </label>
          <div className="list-label">
            <span>TODAS LAS CARTAS</span>
            <span>{visibleLetters.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="letter-list">
            {lettersLoading ? (
              <div className="empty-list"><span className="loader" />Cargando cartas…</div>
            ) : visibleLetters.length ? visibleLetters.map((letter) => (
              <button
                className={`letter-card${selectedId === letter.id && !isWriting ? ' selected' : ''}`}
                key={letter.id}
                onClick={() => { setSelectedId(letter.id); setIsWriting(false); setError(''); setNotice(''); }}
              >
                <span className="letter-card-top">
                  <span className="letter-dot" />
                  <time>{formatDate(letter.created_at)}</time>
                </span>
                <strong>{letter.title}</strong>
                <span className="letter-preview">{letter.body || letter.attachment_name || 'Archivo adjunto'}</span>
                {letter.attachment_path && <span className="attachment-indicator">↳ Con archivo adjunto</span>}
              </button>
            )) : (
              <div className="empty-list">
                <span className="empty-icon">✳</span>
                {search ? 'No hay cartas que coincidan.' : 'Todavía no hay cartas.'}
                {isAdmin && !search && <button className="inline-button" onClick={startNewLetter}>Escribe la primera →</button>}
              </div>
            )}
          </div>
          <div className="sidebar-footer">
            <span className="status-dot" />
            <span>{isAdmin ? 'ADMINISTRADOR/A' : 'ACCESO DE LECTURA'}</span>
            <span className="sidebar-footer-lock" aria-label="Acceso privado">⌑</span>
          </div>
        </aside>

        <section className="reading-area">
          {error && <div className="toast error-message" role="alert">{error}<button onClick={() => setError('')} aria-label="Cerrar aviso">×</button></div>}
          {notice && <div className="toast success-message" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso">×</button></div>}
          {isWriting && isAdmin ? (
            <article className="editor">
              <div className="reader-meta">
                <span className="eyebrow">{editingId ? 'EDITAR CARTA' : 'NUEVA CARTA'}</span>
                <button className="text-button" onClick={cancelWriting}>Cancelar <span aria-hidden="true">×</span></button>
              </div>
              <form className="editor-form" onSubmit={saveLetter}>
                <label className="editor-label" htmlFor="letter-title">Título</label>
                <input id="letter-title" className="title-input" placeholder="Dale un nombre a esta carta…" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required maxLength={160} />
                <div className="editor-divider" />
                <label className="editor-label" htmlFor="letter-body">Tu carta</label>
                <textarea id="letter-body" className="body-input" placeholder="Escribe aquí tus palabras…" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} />
                <div className="upload-area">
                  <label className="upload-control" htmlFor="letter-file">
                    <span className="upload-icon">↑</span>
                    <span><strong>{form.file ? form.file.name : 'Adjuntar un archivo'}</strong><small>PDF, imagen o documento</small></span>
                    <span className="upload-browse">Explorar</span>
                  </label>
                  <input id="letter-file" className="visually-hidden" type="file" accept={ACCEPTED_FILES} onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} />
                  {editingId && letters.find((letter) => letter.id === editingId)?.attachment_name && !form.file && (
                    <span className="current-file">Archivo guardado: {letters.find((letter) => letter.id === editingId).attachment_name}</span>
                  )}
                  {form.file && <button type="button" className="remove-file" onClick={() => setForm((current) => ({ ...current, file: null }))}>Quitar archivo</button>}
                </div>
                <div className="editor-actions">
                  <span>Solo tú puedes crear o modificar cartas.</span>
                  <button className="primary-button" type="submit" disabled={busy || (!form.body.trim() && !form.file)}>
                    {busy ? 'Guardando…' : 'Guardar carta'} <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </form>
            </article>
          ) : selectedLetter ? (
            <article className="reader">
              <div className="reader-meta">
                <span className="eyebrow"><span className="reader-dot" /> CARTA GUARDADA</span>
                {isAdmin && (
                  <div className="reader-actions">
                    <button className="text-button" onClick={() => startEditing(selectedLetter)}>Editar <span aria-hidden="true">↗</span></button>
                    <button className="icon-button delete-button" onClick={() => deleteLetter(selectedLetter)} disabled={busy} aria-label="Eliminar carta" title="Eliminar carta">⌫</button>
                  </div>
                )}
              </div>
              <div className="letter-content">
                <time className="letter-date">{formatDate(selectedLetter.created_at)}</time>
                <h2>{selectedLetter.title}</h2>
                <div className="reader-rule"><span>✳</span></div>
                {selectedLetter.body && <div className="letter-body">{selectedLetter.body}</div>}
                {selectedLetter.attachment_path && (
                  <button className="attachment-card" onClick={() => openAttachment(selectedLetter)}>
                    <span className="file-icon">↗</span>
                    <span className="file-details"><strong>{selectedLetter.attachment_name || 'Archivo adjunto'}</strong><small>Archivo privado · toca para abrir</small></span>
                    <span className="file-open">Abrir</span>
                  </button>
                )}
                {!selectedLetter.body && !selectedLetter.attachment_path && <p className="empty-letter">Esta carta está vacía.</p>}
              </div>
              <div className="reader-bottom">
                <span>FIN DE LA CARTA</span>
                <span className="bottom-flower">✳</span>
              </div>
            </article>
          ) : (
            <div className="welcome-state">
              <div className="welcome-seal">C</div>
              <p className="eyebrow">{search ? 'SIN RESULTADOS' : 'TU ARCHIVO PRIVADO'}</p>
              <h2>{search ? 'No encontramos esa carta.' : 'Un espacio para las palabras.'}</h2>
              <p>{search ? 'Prueba con otro título o una palabra de la carta.' : 'Las cartas aparecerán aquí para que puedas leerlas con calma.'}</p>
              {isAdmin && !search && <button className="primary-button" onClick={startNewLetter}>Escribir una carta <span aria-hidden="true">↗</span></button>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default App;
