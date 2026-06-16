// netlify/functions/get-noticias.js
// Hace la llamada a la WordPress API desde el servidor, sin problema de CORS

exports.handler = async () => {
  try {
    const WP_URL = 'https://www.matermundi.tv/wp-json/wp/v2/posts?per_page=8&_embed=wp:featuredmedia&_fields=id,title,link,_links,_embedded,content';
    
    const res = await fetch(WP_URL, {
      headers: { 'User-Agent': 'MatermundiApp/1.0' }
    });

    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'WordPress API error', status: res.status }) };
    }

    const posts = await res.json();

    const noticias = posts.map(function(p) {
      var img = '';
      try { img = p._embedded['wp:featuredmedia'][0].source_url || ''; } catch(e) {}
      // Fallback: extraer primera imagen del contenido si no hay featured media
      if (!img && p.content && p.content.rendered) {
        var match = p.content.rendered.match(/<img[^>]+src=["']([^"']+)["']/);
        if (match) img = match[1];
      }
      var titulo = (p.title && p.title.rendered || '')
        .replace(/&amp;/g, '&')
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;/g, '«')
        .replace(/&#8221;/g, '»')
        .replace(/&#8230;/g, '…')
        .replace(/<[^>]+>/g, '');
      return {
        id: 'wp_' + p.id,
        titulo: titulo,
        url: p.link || '',
        imagen_url: img,
        categoria: 'noticias'
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800' // cachear 30 min
      },
      body: JSON.stringify(noticias)
    };

  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
