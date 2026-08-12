import { Link } from 'react-router-dom';
import { EmptyState } from '../components/DataTable';
export default function NotFoundPage() { return <main className="centered-page"><EmptyState title="Page not found" message="The page you requested does not exist or is no longer available." action={<Link className="button button--primary" to="/">Return to dashboard</Link>} /></main>; }
