import AgroMap from '@/components/AgroMap';
import { store } from '@/store';
import { Provider } from 'react-redux';

export default function Page() {
  return (
    <Provider store={store}>
      <main>
        <AgroMap />
      </main>
    </Provider>
  );
}