import { Loader2Icon } from 'lucide-react';
import { Flex } from 'pickle-ui';

export function PageSpinner() {
  return (
    <Flex
      as="output"
      align="center"
      aria-label="Loading"
      className="min-h-70"
      justify="center"
    >
      <Loader2Icon
        aria-hidden
        className="animate-spin text-muted-foreground"
        size={20}
      />
    </Flex>
  );
}
