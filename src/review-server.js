import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { WorkflowService } from './workflow-v063.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const readBody = req => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', c => { body += c; if (body.length > 2_000_000) req.destroy(); });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});
const parseForm = body => Object.fromEntries(new URLSearchParams(body));

function defaultKeyFile(name) {
  return path.join(os.homedir(), '.workbuddy', 'kb-review-keys', name);
}
function readKey(envName, fallback) {
  const file = process.env[envName] || fallback;
  if (!fs.existsSync(file)) throw new Error(`找不到审阅密钥: ${file}。只需初始化一次：node scripts/generate-review-keypair.js --out "${path.dirname(file)}"`);
  return fs.readFileSync(file, 'utf8');
}

function page(service, runId, token, message = '') {
  const resumed = service.resume(runId);
  const state = resumed.state;
  const cpName = resumed.checkpoint;
  const cp = cpName ? state.checkpoints[cpName] : null;
  let main = '';

  if (!cp) {
    main = `<section><h2>当前无需人工签批</h2><p>状态：${esc(resumed.status)}；下一动作：${esc(resumed.required_action)}</p></section>`;
  } else if (cpName === 'canonical_proposal') {
    const proposals = service.artifact(state, 'proposal').data.proposals;
    const sourceId = state.stages.proposal.artifact_id;
    const done = new Map(state.decisions.filter(d => d.checkpoint === cpName && d.source_artifact_id === sourceId).map(d => [d.proposal_id, d]));
    main = `<section><h2>正式知识提案</h2>
    <p>这些提案只用于预览。正式审核必须在知识库网页的“收件箱 → 待确认”完成。</p>
    <p>聊天里的“继续/可以”以及本地 Review Panel 都不能把 Proposal 直接写成正式知识。</p>
    ${proposals.map((p,i) => `<article class="card"><h3>${i+1}. ${esc(p.id)}</h3><pre>${esc(p.text)}</pre></article>`).join('')}
    <p class="done">候选文件已输出到 delivery bundle 的 review-inbox/，请由站点导入或同步后审核。</p></section>`;
  } else {
    main = `<section><h2>需要你判断</h2><p><b>${esc(cpName)}</b></p><p>${esc(cp.reason)}</p>
    <p>批准表示“接受当前 Artifact”，不会签入 AI 拼出来的自由文本。若内容需要改，选择退回修改。</p>
    <form method="post" action="/simple?token=${token}">
      <input type="hidden" name="checkpoint" value="${esc(cpName)}">
      <button name="decision" value="approved" type="submit">批准当前版本</button>
      <button class="danger" name="decision" value="rejected" type="submit">退回修改</button>
    </form></section>`;
  }

  const publishButton = resumed.required_action === 'publish_approved_skill'
    ? `<form method="post" action="/publish?token=${token}"><button type="submit">发布已批准 Skill</button></form>` : '';
  const applyButton = '';

  return `<!doctype html><meta charset="utf-8"><title>知识整理审核</title>
  <style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:980px;margin:32px auto;padding:0 18px;color:#1f2328;background:#f6f8fa}
  section{background:white;border:1px solid #d0d7de;border-radius:12px;padding:22px;margin-bottom:18px}.card{border-top:1px solid #d8dee4;padding:18px 0}
  pre{white-space:pre-wrap;background:#f6f8fa;padding:14px;border-radius:8px;max-height:340px;overflow:auto}
  label{margin-right:18px}textarea{display:block;width:96%;min-height:76px;margin:10px 0 4px;padding:8px}
  button{padding:10px 18px;border:0;border-radius:8px;background:#1f883d;color:white;font-weight:650;margin:8px 8px 0 0;cursor:pointer}
  button.danger{background:#cf222e}.done{color:#1a7f37}.msg{background:#fff8c5;border:1px solid #d4a72c;border-radius:8px;padding:10px}.apply{display:block;margin:14px 0}</style>
  <h1>知识整理审核</h1>${message ? `<p class="msg">${esc(message)}</p>` : ''}${main}${applyButton}${publishButton}
  <section><small>run: ${esc(runId)} ｜ 页面只监听 127.0.0.1；签名私钥只在本地 Review Service 进程中读取，不写入页面或 Agent 上下文。</small></section>`;
}

export async function startReviewServer({ store, runId, port = 0, host = '127.0.0.1' }) {
  const reviewerPublicKey = readKey('KB_REVIEW_PUBLIC_KEY_FILE', defaultKeyFile('review-public.pem'));
  const reviewerPrivateKey = readKey('KB_REVIEW_PRIVATE_KEY_FILE', defaultKeyFile('review-private.pem'));
  const service = new WorkflowService(store, { reviewerPublicKey, reviewerPrivateKey });
  const token = crypto.randomBytes(24).toString('hex');

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}`);
      if (url.searchParams.get('token') !== token) { res.writeHead(403); return res.end('Forbidden'); }
      let message = '';

      if (req.method === 'POST' && url.pathname === '/simple') {
        const form = parseForm(await readBody(req));
        service.recordDecision(runId, { checkpoint: form.checkpoint, decision: form.decision },
          { actor: 'user_review_service' });
        message = form.decision === 'approved' ? '已批准当前版本。' : '已退回当前版本，等待 AI 重做该阶段。';
      } else if (req.method === 'POST' && url.pathname === '/publish') {
        service.publishApprovedSkill(runId, { actor: 'user_review_service' });
        message = '已发布正式 Skill，并生成可安装 SKILL.md 文件夹。';
      }

      res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      res.end(page(service, runId, token, message));
    } catch (error) {
      res.writeHead(500, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      res.end(`<meta charset="utf-8"><h2>审核操作失败</h2><pre>${esc(error.stack || error.message)}</pre>`);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const url = `http://${host}:${address.port}/?token=${token}`;
  return { server, url, service };
}
