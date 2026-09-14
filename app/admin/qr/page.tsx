import { redirect } from 'next/navigation';

export default function LegacyQrLibraryRoute(){
  redirect('/admin?view=qr');
}
