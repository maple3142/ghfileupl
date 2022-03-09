#!/usr/bin/env node
const login = require('./login')
const prompts = require('prompts')
const qs = require('querystring')
const mime = require('mime-types')
const { CookieJar } = require('tough-cookie')
const got = require('got')
const FormData = require('form-data')
const cheerio = require('cheerio')
const fs = require('fs-extra')
const path = require('path')

if (process.argv.length < 3) {
	console.error(`Usage: gupl <filepath>`)
	process.exit(1)
}

const ALLOWED_FILETYPES = ['gif', 'jpg', 'jpeg', 'png', 'docx', 'gz', 'log', 'pdf', 'pptx', 'txt', 'xlsx', 'zip']
const REPOURL = 'https://github.com/github/feedback/discussions/new'
const COOKIEFILE = path.join(__dirname, 'cookie.json')
const FILEPATH = path.resolve(process.argv[2])

const isFileAllowed = ALLOWED_FILETYPES.some(ext => FILEPATH.toLowerCase().endsWith(ext))
if (!isFileAllowed) {
	console.log('Your file is not allowed to upload to GitHub.')
	console.log(`Only ${ALLOWED_FILETYPES.join(', ')} are allowed.`)
	process.exit(1)
}

const readCookie = async () => {
	if (await fs.exists(COOKIEFILE)) {
		// if cookie already exists
		return CookieJar.fromJSON(await fs.readFile(COOKIEFILE, 'utf-8'))
	}

	const questions = [
		{
			type: 'text',
			name: 'username',
			message: 'What is your GitHub username?',
			validate: v => !!v
		},
		{
			type: 'password',
			name: 'password',
			message: 'What is your GitHub password?',
			validate: v => !!v
		},
		{
			type: 'confirm',
			name: 'has2fa',
			message: 'Do you have 2fa enabled?'
		},
		{
			type: has2fa => (has2fa ? 'text' : null),
			name: 'otp',
			message: 'Please enter current otp here:',
			validate: v => !!v && /^\d{6}$/.test(v)
		}
	]
	const r = await prompts(questions)
	const cookie = await login(r.username, r.password, r.otp)
	await fs.writeFile(COOKIEFILE, JSON.stringify(cookie.toJSON()))
	console.log(`Your GitHub login credentials(cookies) have been saved to "${COOKIEFILE}".`)
	console.log('To delete it, you can execute "gupl-reset" or "ghfileupl-reset".')
	return cookie
}
;(async () => {
	const cookieJar = await readCookie()
	const client = got.extend({
		cookieJar,
		followRedirect: false,
		hooks: {
			beforeRequest: opts => {
				if (opts.form) {
					opts.body = qs.stringify(opts.form)
					opts.headers['Content-Length'] = opts.body.length
				}
			}
		}
	})
	const $ = await client.get(REPOURL).then(r => cheerio.load(r.body))
	const stat = await fs.stat(FILEPATH)
	try {
		const res = await client
			.post('https://github.com/upload/policies/assets', {
				form: {
					name: path.basename(FILEPATH),
					size: stat.size,
					content_type: mime.lookup(FILEPATH),
					authenticity_token: $('.js-upload-markdown-image').children('input[type=hidden]').attr('value'),
					repository_id: parseInt($('meta[name="octolytics-dimension-repository_id"]').attr('content'))
				}
			})
			.then(r => JSON.parse(r.body))
			.catch(e => {
				throw JSON.parse(e.body)
			})
		const fd = new FormData()
		for (const [k, v] of Object.entries(res.form)) {
			fd.append(k, v)
		}
		fd.append('file', fs.createReadStream(FILEPATH))
		await client.post(res.upload_url, { body: fd })
		const fd2 = new FormData()
		fd2.append('authenticity_token', res.asset_upload_authenticity_token)
		const result = await client
			.put('https://github.com' + res.asset_upload_url, { headers: { Accept: 'application/json' }, body: fd2 })
			.then(r => JSON.parse(r.body))
		console.log(JSON.stringify(result, null, 2))
	} catch (e) {
		if (e.errors) {
			console.error(e.errors)
		} else {
			console.error(e)
		}
	}
})().catch(console.error)
