ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
CREATE TYPE "ActionTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
CREATE TABLE "ActionToken" (
 "id" UUID NOT NULL,
 "userId" UUID NOT NULL,
 "type" "ActionTokenType" NOT NULL,
 "tokenHash" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ActionToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActionToken_tokenHash_key" ON "ActionToken"("tokenHash");
CREATE INDEX "ActionToken_userId_type_idx" ON "ActionToken"("userId", "type");
CREATE UNIQUE INDEX "ActionToken_userId_type_key" ON "ActionToken"("userId", "type");
ALTER TABLE "ActionToken" ADD CONSTRAINT "ActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
