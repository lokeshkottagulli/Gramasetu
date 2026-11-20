export async function readBody(request, limit = 8192) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
