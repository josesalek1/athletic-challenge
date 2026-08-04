import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function embed(url: string) {
  const yt = url.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  return null;
}

export default async function Videos() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('videos')
    .select('id, title, url, challenge_id')
    .order('sort_order');

  const videos = data ?? [];

  return (
    <main className="wrap">
      <p className="eyebrow">Del entrenador</p>
      <h1 className="display" style={{ fontSize: 36, margin: '8px 0 20px' }}>Ejercicios</h1>

      {videos.length === 0 ? (
        <p className="empty">
          Todavía no hay vídeos.
          <br />
          Súbelos a YouTube como <strong>no listados</strong> y pega el enlace en la tabla{' '}
          <code>videos</code> de Supabase.
        </p>
      ) : (
        videos.map((v) => {
          const src = embed(v.url);
          return (
            <div key={v.id} className="card">
              <p style={{ fontWeight: 600, marginBottom: 12 }}>{v.title}</p>
              {src ? (
                <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 10, overflow: 'hidden' }}>
                  <iframe
                    src={src}
                    title={v.title}
                    allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                  />
                </div>
              ) : (
                <a className="btn btn-ghost" style={{ width: '100%' }} href={v.url}
                   target="_blank" rel="noopener noreferrer">
                  Abrir el vídeo
                </a>
              )}
            </div>
          );
        })
      )}
    </main>
  );
}
