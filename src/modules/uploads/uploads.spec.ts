import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { detectUploadContent } from './upload-mime.util';
import { UploadsController } from './uploads.controller';

describe('Upload MIME FASE 4.1', () => {
  it('TEST 15: JPEG válido → PASS', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const r = detectUploadContent(jpeg, 'image/jpeg', 'avatars');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('image/jpeg');
  });

  it('TEST 16: MIME image/jpeg con contenido no imagen → FAIL', () => {
    const fake = Buffer.from('<html>not image</html>');
    const r = detectUploadContent(fake, 'image/jpeg', 'feed');
    expect(r.ok).toBe(false);
  });

  it('TEST 18: SVG/HTML → FAIL', () => {
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectUploadContent(svg, 'image/svg+xml', 'feed').ok).toBe(false);
  });
});

describe('UploadsController ownership', () => {
  it('TEST 19: objectKey cliente → rechazado', async () => {
    const ctrl = new UploadsController({} as any, {} as any);
    await expect(
      ctrl.direct(
        { sub: 'u1' } as any,
        { buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), mimetype: 'image/jpeg' },
        'avatars',
        'evil/key.jpg',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST 21: USER A delete upload USER B → FAIL', async () => {
    const prisma = {
      uploadAsset: {
        findUnique: jest.fn(async () => ({
          id: 'up1',
          ownerUserId: 'b',
          objectKey: 'avatars/b/x.jpg',
        })),
        delete: jest.fn(),
      },
    };
    const storage = { deleteObjectsBestEffort: jest.fn() };
    const ctrl = new UploadsController(storage as any, prisma as any);
    await expect(ctrl.deleteOwned({ sub: 'a' } as any, 'up1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.uploadAsset.delete).not.toHaveBeenCalled();
  });

  it('delete propio → PASS', async () => {
    const prisma = {
      uploadAsset: {
        findUnique: jest.fn(async () => ({
          id: 'up1',
          ownerUserId: 'a',
          objectKey: 'avatars/a/x.jpg',
        })),
        delete: jest.fn(async () => ({})),
      },
    };
    const storage = { deleteObjectsBestEffort: jest.fn(async () => ({ deleted: 1, failed: 0 })) };
    const ctrl = new UploadsController(storage as any, prisma as any);
    await expect(ctrl.deleteOwned({ sub: 'a' } as any, 'up1')).resolves.toEqual({ ok: true });
  });

  it('upload inexistente → 404', async () => {
    const prisma = {
      uploadAsset: { findUnique: jest.fn(async () => null), delete: jest.fn() },
    };
    const ctrl = new UploadsController({} as any, prisma as any);
    await expect(ctrl.deleteOwned({ sub: 'a' } as any, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
