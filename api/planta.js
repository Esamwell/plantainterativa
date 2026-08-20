// Guarda/lê o estado atual da planta no Vercel Blob — sem banco de dados.
// GET  -> devolve o último estado salvo (ou {ok:true, vazio:true} se nunca salvou nada)
// POST -> recebe o JSON da planta e sobrescreve o arquivo salvo
//
// Autenticação: funciona tanto com um projeto conectado via OIDC (padrão
// atual da Vercel — usa BLOB_STORE_ID + token OIDC injetado automaticamente
// em cada execução) quanto com o token estático BLOB_READ_WRITE_TOKEN
// (projetos mais antigos). Não force nenhum dos dois: deixa o SDK decidir.
const { put, head, BlobNotFoundError } = require('@vercel/blob');

const CAMINHO = 'planta-atual.json';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      var info;
      try {
        info = await head(CAMINHO);
      } catch (e) {
        if (e instanceof BlobNotFoundError) { res.status(200).json({ ok: true, vazio: true }); return; }
        throw e;
      }
      var sep = info.url.indexOf('?') >= 0 ? '&' : '?';
      var r = await fetch(info.url + sep + 't=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) { res.status(200).json({ ok: true, vazio: true }); return; }
      var doc = await r.json();
      res.status(200).json({ ok: true, doc: doc });
      return;
    }

    if (req.method === 'POST') {
      var body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      if (!body || !body.paredes) { res.status(400).json({ ok: false, erro: 'JSON inválido: falta "paredes".' }); return; }
      await put(CAMINHO, JSON.stringify(body), {
        access: 'public',
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
