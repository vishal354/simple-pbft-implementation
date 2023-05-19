import crypto from 'crypto'

export default class Elliptic {
    constructor() {
        const {publicKey, privateKey} = crypto.generateKeyPairSync('ec', {
            namedCurve: 'secp256k1'
        })

        this.publicKey = publicKey
        this.privateKey = privateKey
    }

    getPublicKey() {
        const pk = this.publicKey.export({type:'spki', format:'pem'})
        return pk
    }

    getPrivateKey() {
        const sk = this.privateKey.export({type:"pkcs8", format:"pem"})
        return sk
    }

    // To see the coordinates of the point on elliptic curve
    getPublicKeyJwk() {
        const pk = this.publicKey.export({type:'spki', format:'jwk'})
        return pk
    }

    getPrivateKeyJwk() {
        const sk = this.privateKey.export({type:"pkcs8", format:"jwk"})
        return sk
    }

    sign(data) {
        const signer = crypto.createSign('sha256')
        signer.update(data)
        const signature = signer.sign(this.privateKey, 'hex')
        return signature
    }

    verify(data, signature, publicKey) {
        const verifier = crypto.createVerify('sha256')
        verifier.update(data)
        const isVerified = verifier.verify(publicKey, signature, 'hex')
        return isVerified
    }
}
