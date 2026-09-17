import ConfirmAccess from './ConfirmAccess';

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const { token_hash } = await searchParams;
  return <ConfirmAccess tokenHash={token_hash ?? ''} />;
}
