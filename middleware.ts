import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refresca la sesión en cada petición y echa a los no autenticados.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options?: CookieOptions }[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith('/login') || path.startsWith('/auth') || path === '/offline';
  let isActive = false;

  if (user) {
    const { data: membership } = await supabase
      .from('profiles')
      .select('active')
      .eq('id', user.id)
      .maybeSingle();
    isActive = Boolean(membership?.active);
  }

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (user && !isActive && !isPublic) {
    const login = new URL('/login', request.url);
    login.searchParams.set('error', 'account_disabled');
    return NextResponse.redirect(login);
  }
  if (user && isActive && path === '/login') {
    return NextResponse.redirect(new URL('/hoy', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.png).*)'],
};
