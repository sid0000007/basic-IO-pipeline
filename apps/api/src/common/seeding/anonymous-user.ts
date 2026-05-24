import { PrismaService } from '../../prisma/prisma.service';

// Single anonymous user that owns every conversation in v1.
// Adding auth later means generating real user rows; this row stays for any
// historical conversations and the column type doesn't change.
export const ANONYMOUS_USER_ID = '00000000-0000-0000-0000-000000000001';

export async function seedAnonymousUser(prisma: PrismaService): Promise<string> {
  await prisma.user.upsert({
    where: { id: ANONYMOUS_USER_ID },
    create: { id: ANONYMOUS_USER_ID, name: 'Anonymous' },
    update: {},
  });
  return ANONYMOUS_USER_ID;
}
