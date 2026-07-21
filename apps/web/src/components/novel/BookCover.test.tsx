import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookCover, isManagedBookCoverImage } from './BookCover';

describe('BookCover', () => {
  it('keeps legacy CSS-color covers without treating them as image URLs', () => {
    render(<BookCover cover="#1f6d7a" title="颜色作品" category="科幻" className="h-24" />);

    expect(isManagedBookCoverImage('#1f6d7a')).toBe(false);
    expect(screen.getByLabelText('《颜色作品》颜色封面')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders only a server-generated media cover path as an image', () => {
    const cover = '/media/covers/11111111-1111-1111-1111-111111111111.png';
    render(<BookCover cover={cover} title="图片作品" category="悬疑" className="h-24" />);

    expect(isManagedBookCoverImage(cover)).toBe(true);
    expect(screen.getByRole('img', { name: '《图片作品》封面' }).getAttribute('src')).toBe(cover);
    expect(isManagedBookCoverImage('https://minio.internal/novel-covers/covers/file.png')).toBe(false);
  });
});
