// A successful auth response does not guarantee email delivery.
export function authMessage(error){
 const text=error?.message||'';
 const code=error?.code||(/email not confirmed/i.test(text)?'email_not_confirmed':/invalid login credentials/i.test(text)?'invalid_credentials':/email address not authorized/i.test(text)?'email_address_not_authorized':/email rate limit exceeded/i.test(text)?'over_email_send_rate_limit':'');
 if(code==='email_not_confirmed')return 'Please confirm your email before signing in. You can request another confirmation below.';
 if(code==='invalid_credentials')return 'The email or password is incorrect. Try again or use Forgot password.';
 if(code==='email_address_not_authorized')return 'Email delivery is not configured for this address. Please contact SkySculpt support.';
 if(code==='over_email_send_rate_limit')return 'Email delivery is temporarily limited. Please wait before retrying, or contact SkySculpt support.';
 if(code==='over_request_rate_limit')return 'Too many attempts. Please wait a moment and try again.';
 if(/sending.*(?:email|mail)|smtp/i.test(error?.message||''))return 'The confirmation or reset email could not be sent. Please contact SkySculpt support.';
 return error?.message||'Unable to complete the request. Please try again.';
}
