const MAX = 1900;

export function splitForDiscord(text: string, maxLen = MAX): string[] {
  if (!text) return [];
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let buffer = "";
  const paragraphs = text.split(/\n{2,}/);

  function flush() {
    if (!buffer) return;
    const fenceCount = (buffer.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) buffer += "\n```";
    chunks.push(buffer);
    buffer = "";
  }

  function safeAppend(piece: string) {
    const candidate = buffer ? buffer + "\n\n" + piece : piece;
    if (candidate.length <= maxLen) { buffer = candidate; return; }

    const lines = piece.split(/\n/);
    let block = "";
    for (const ln of lines) {
      const tmp = block ? block + "\n" + ln : ln;
      const headroom = buffer ? buffer.length + 2 : 0;
      if (headroom + tmp.length <= maxLen) {
        block = tmp;
      } else {
        if (block) {
          if (buffer) { buffer += "\n\n" + block; flush(); }
          else chunks.push(block.slice(0, maxLen));
          block = ln;
        } else {
          const pieces = ln.split(/(?<=[\.!?])\s+/);
          let sent = "";
          for (const s of pieces) {
            const sTmp = sent ? sent + " " + s : s;
            const head = buffer ? buffer.length + 2 : 0;
            if (head + sTmp.length <= maxLen) {
              sent = sTmp;
            } else {
              if (sent) {
                if (buffer) { buffer += "\n\n" + sent; flush(); }
                else chunks.push(sent.slice(0, maxLen));
                sent = s;
              } else {
                let rest = s;
                while (rest.length > maxLen) {
                  chunks.push(rest.slice(0, maxLen));
                  rest = rest.slice(maxLen);
                }
                sent = rest;
              }
            }
          }
          if (sent) {
            const cand = buffer ? buffer + "\n\n" + sent : sent;
            if (cand.length <= maxLen) buffer = cand; else { flush(); buffer = sent; }
          }
          block = "";
        }
      }
    }
    if (block) {
      const cand = buffer ? buffer + "\n\n" + block : block;
      if (cand.length <= maxLen) buffer = cand; else { flush(); buffer = block; }
    }
  }

  for (const piece of paragraphs) safeAppend(piece);
  flush();
  return chunks;
}

export function planInteractiveDelivery(fullText: string) {
  const parts = splitForDiscord(fullText, MAX);
  if (parts.length <= 1) return { first: parts[0] || "", rest: [] };
  const first = parts[0] + "\n\n(Reply **more** for details, or **stop**.)";
  return { first, rest: parts.slice(1) };
}
