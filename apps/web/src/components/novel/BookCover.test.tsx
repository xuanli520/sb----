import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookCover, isManagedBookCoverImage, isManagedHomeBannerImage } from './BookCover';

describe('BookCover', () => {
  it('uses the neutral panel for legacy CSS-color cover values', () => {
    render(<BookCover cover="#1f6d7a" title="颜色作品" category="科幻" className="h-24" />);

    expect(isManagedBookCoverImage('#1f6d7a')).toBe(false);
    expect(screen.getByLabelText('《颜色作品》中性封面')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders only a server-generated media cover path as an image', () => {
    const cover = '/media/covers/11111111-1111-1111-1111-111111111111.png';
    render(<BookCover cover={cover} title="图片作品" category="悬疑" className="h-24" />);

    expect(isManagedBookCoverImage(cover)).toBe(true);
    expect(screen.getByRole('img', { name: '《图片作品》封面' }).getAttribute('src')).toBe(cover);
    expect(isManagedBookCoverImage('https://minio.internal/novel-covers/covers/file.png')).toBe(false);
  });

  it('uses a managed book cover after a managed home banner cannot be loaded', () => {
    const banner = '/media/banners/22222222-2222-2222-2222-222222222222.jpg';
    const cover = '/media/covers/11111111-1111-1111-1111-111111111111.png';
    render(<BookCover cover={banner} fallbackCover={cover} title="轮播作品" category="科幻" showLabel={false} className="h-24" />);

    expect(isManagedHomeBannerImage(banner)).toBe(true);
    const bannerImage = screen.getByRole('img', { name: '《轮播作品》封面' });
    expect(bannerImage.getAttribute('src')).toBe(banner);
    fireEvent.error(bannerImage);

    expect(screen.getByRole('img', { name: '《轮播作品》封面' }).getAttribute('src')).toBe(cover);
  });

  it('falls back to a neutral cover after every managed source fails', () => {
    const cover = '/media/covers/11111111-1111-1111-1111-111111111111.png';
    render(<BookCover cover={cover} title="失效图片" category="科幻" className="h-24" />);

    fireEvent.error(screen.getByRole('img', { name: '《失效图片》封面' }));
    expect(screen.queryByRole('img', { name: '《失效图片》封面' })).toBeNull();
    expect(screen.getByLabelText('《失效图片》中性封面')).toBeTruthy();
  });
});
