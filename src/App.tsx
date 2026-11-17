import { useRoute } from './router'
import { Library } from './views/Library'
import { Practice } from './views/Practice'
import { Setup } from './views/Setup'

export default function App() {
  const route = useRoute()
  return (
    <div className="app">
      {route.name === 'library' && <Library />}
      {route.name === 'practice' && <Practice key={route.id} pieceId={route.id} />}
      {route.name === 'setup' && <Setup key={route.id} pieceId={route.id} />}
    </div>
  )
}
