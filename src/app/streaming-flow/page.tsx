import { StreamingFlowAnimation } from '@/app/components/StreamingFlowAnimation';

// Standalone preview route for the otherwise-unused StreamingFlowAnimation
// component. Visit /streaming-flow to see it rendered on a black backdrop.
export default function StreamingFlowPreviewPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'black',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <StreamingFlowAnimation width={560} />
    </main>
  );
}
