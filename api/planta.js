// Guarda/lê o estado atual da planta no Vercel Blob — sem banco de dados.
// GET  -> devolve o último estado salvo (ou {ok:true, vazio:true} se nunca salvou nada)
// POST -> recebe o JSON da planta e sobrescreve o arquivo salvo
//
// A store é privada (só quem tem a credencial do projeto lê/escreve), e a
// autenticação funciona tanto via OIDC (padrão atual da Vercel — token
// injetado automaticamente a cada execução) quanto via o antigo token
// estático BLOB_READ_WRITE_TOKEN. Não força nenhum dos dois: deixa o SDK
// decidir sozinho qual credencial usar.
const { put, get } = require('@vercel/blob');

const CAMINHO = 'planta-atual.json';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      var resultado = await get(CAMINHO, { access: 'private', useCache: false });
      if (!resultado || !resultado.stream) { res.status(200).json({ ok: true, vazio: true }); return; }
      var doc = await new Response(resultado.stream).json();
      res.status(200).json({ ok: true, doc: doc });
      return;
    }

    if (req.method === 'POST') {
      var body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      if (!body || !body.paredes) { res.status(400).json({ ok: false, erro: 'JSON inválido: falta "paredes".' }); return; }
      await put(CAMINHO, JSON.stringify(body), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, erro: 'método não suportado' });
  } catch (e) {
    res.status(500).json({ ok: false, erro: String((e && e.message) || e) });
  }
};
