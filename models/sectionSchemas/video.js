function validateVideo(data = {}) {
  return {
    source: ['url', 'upload'].includes(data.source) ? data.source : 'url',
    videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : '',
    posterUrl: typeof data.posterUrl === 'string' ? data.posterUrl : '',
    heading: typeof data.heading === 'string' ? data.heading : '',
    autoplay: !!data.autoplay,
    muted: data.muted !== false,
    loop: !!data.loop,
    aspectRatio: ['16/9', '4/3', '1/1', '9/16'].includes(data.aspectRatio) ? data.aspectRatio : '16/9',
  };
}
module.exports = { validateVideo };
