import sha256 from 'sha256'

export default class Blockchain {
    constructor(currentNodeUrl) {
        this.currentNodeUrl = currentNodeUrl
        this.networkNodes = []
        this.pendingData = []
        this.chain = []
        this.chain.push(this.createGenesisBlock())
    }

    // It can store any kind of data
    createTransactionData(sender, recipient, amount, signature, transactionId) {
        const dataBlock = {
            transactionId: transactionId,
            sender: sender,
            recipient: recipient,
            amount: amount,
            signature: signature
        }
        return dataBlock
    }

    createGenesisBlock() {
        const genesisBlock = {
            blockId: 1,
            transactions: [],
            previousHash: '0',
            hash: '0'
        }

        return genesisBlock
    }

    // Create a new block
    createBlock() {
        const lastBlock = this.getLastBlock()
        const previousHash = lastBlock.hash
        const newBlockId = this.chain.length + 1
        const transactions = this.pendingData
        const hash = this.hashBlock(newBlockId, previousHash, transactions)
        

        const block = {
            blockId: newBlockId,
            transactions: transactions,
            previousHash: previousHash,
            // creator: this.currentNodeUrl,
            hash: hash,
        }

        return block
    }

    hashBlock(blockId, previousHash, transactions) {
        const dataAsString = blockId + previousHash + JSON.stringify(transactions)
        const hash = sha256(dataAsString)
        return hash
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1]
    }

    addNode(newNodeUrl) {
        const isCurrentNode = (newNodeUrl === this.currentNodeUrl)
        const isAlreadyPresent = this.networkNodes.indexOf(newNodeUrl) !== -1

        if(!isCurrentNode && !isAlreadyPresent) {
            this.networkNodes.push(newNodeUrl)
        }
    }
}