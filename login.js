const got = require('got')
const cheerio = require('cheerio')
const { CookieJar } = require('tough-cookie')
const qs = require('querystring')

module.exports = async (acc, pwd, otp) => {
	const cookieJar = new CookieJar()
	const client = got.extend({
		cookieJar,
		headers: {
			Accept: 'text/html'
		},
		followRedirect: false,
		hooks: {
			beforeRequest: opts => {
				//console.log(opts)
				if (opts.form) {
					opts.body = qs.stringify(opts.form)
					opts.headers['Content-Length'] = opts.body.length
				}
			}
		}
	})
	const $lg = await client.get('https://github.com/login').then(r => cheerio.load(r.body))
	const authenticity_token = $lg('input[name=authenticity_token]').attr('value')
	const resp = await client.post('https://github.com/session', {
		cookieJar,
		form: {
			login: acc,
			password: pwd,
			authenticity_token,
			utf8: '✓',
			commit: 'Sign in'
		}
	})
	if (resp.statusCode === 200) {
		//failed
		throw new Error('Login failed!')
	} else if (resp.headers.location === 'https://github.com/') {
		//success
		return cookieJar
	} else if (resp.headers.location === 'https://github.com/sessions/two-factor') {
		// 2fa
		const $fa = await client.get('https://github.com/sessions/two-factor').then(r => cheerio.load(r.body))
		const authenticity_token2 = $fa('input[name=authenticity_token]').attr('value')
		const resp2 = await client.post('https://github.com/sessions/two-factor', {
			form: {
				otp,
				authenticity_token: authenticity_token2,
				utf8: '✓'
			}
		})
		if (resp2.headers.location === 'https://github.com/') {
			return cookieJar
		} else {
			throw new Error('Login failed!')
		}
	} else {
		throw new Error('Unknown status!')
	}
}

if (require.main === module) {
	module.exports('USERNAME', 'PASSWORD', 'OTP CODE (optional)').then(console.log, e => console.error(e))
}
