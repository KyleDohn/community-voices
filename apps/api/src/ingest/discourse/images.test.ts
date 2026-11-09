import { describe, expect, it } from 'vitest';
import { imagesFromCooked, MAX_IMAGES_PER_POST } from './images';

// Trimmed from post 460890's cooked HTML (discuss.pixls.us), plus the image kinds to skip.
const upload = (sha: string, alt: string, w: number, h: number, color = '756A55') =>
  `<div class="lightbox-wrapper"><a class="lightbox" href="https://cdn.example/original/3X/${sha}.jpeg">` +
  `<img src="https://cdn.example/optimized/3X/${sha}_2_${w}x${h}.jpeg" alt="${alt}" ` +
  `data-base62-sha1="${sha}" width="${w}" height="${h}" srcset="x 1.5x" data-dominant-color="${color}">` +
  `</a></div>`;

describe('imagesFromCooked', () => {
  it('reads each uploaded image, in post order', () => {
    const cooked = `<p>Two looks:</p>${upload('aaa', 'frame13-spektrafilm', 690, 455)}${upload('bbb', 'frame17', 542, 1000, '322A07')}`;
    expect(imagesFromCooked(cooked)).toEqual([
      {
        url: 'https://cdn.example/optimized/3X/aaa_2_690x455.jpeg',
        alt: 'frame13-spektrafilm',
        width: 690,
        height: 455,
        dominantColor: '#756A55',
      },
      {
        url: 'https://cdn.example/optimized/3X/bbb_2_542x1000.jpeg',
        alt: 'frame17',
        width: 542,
        height: 1000,
        dominantColor: '#322A07',
      },
    ]);
  });

  it('skips emoji, onebox previews and avatars, which carry no upload sha', () => {
    const cooked =
      '<img src="/images/emoji/twitter/camera.png?v=12" title=":camera:" class="emoji" alt=":camera:" width="20" height="20">' +
      '<aside class="onebox"><img src="https://github.com/og.png" class="thumbnail" width="60" height="60"></aside>' +
      '<img alt="" width="24" height="24" src="/user_avatar/discuss.pixls.us/someone/48/1_2.png" class="avatar">';
    expect(imagesFromCooked(cooked)).toEqual([]);
  });

  it('makes protocol-relative urls absolute, decodes the alt text, and allows a missing colour', () => {
    const cooked =
      '<img src="//cdn.example/original/3X/ccc.png" alt="before &amp; after" data-base62-sha1="ccc" width="400" height="300">';
    expect(imagesFromCooked(cooked)).toEqual([
      {
        url: 'https://cdn.example/original/3X/ccc.png',
        alt: 'before & after',
        width: 400,
        height: 300,
        dominantColor: null,
      },
    ]);
  });

  it(`keeps at most ${MAX_IMAGES_PER_POST} images per post`, () => {
    const cooked = Array.from({ length: MAX_IMAGES_PER_POST + 3 }, (_, i) =>
      upload(`s${i}`, `shot ${i}`, 690, 460),
    ).join('');
    const images = imagesFromCooked(cooked);
    expect(images).toHaveLength(MAX_IMAGES_PER_POST);
    expect(images[0]!.alt).toBe('shot 0');
  });
});
