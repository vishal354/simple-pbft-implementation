import express, { request } from 'express'
import cors from 'cors'
import Blockchain from './blockchain.js'
import axios from 'axios'
import Elliptic from './elliptic.js'
import {v1 as uuid} from 'uuid'

// Create all the necessary variables
const port = process.argv[2]
const currentNodeUrl = "http://localhost:" + port
const app = express()
const mycoin = new Blockchain(currentNodeUrl)
const ecc = new Elliptic()
let viewNumber = 1
let blockToBeAdded = {}
let selfDigest = ''
let prepareCount = 1
let commitCount = 1
let prepareFinished = false

// Remove this code
// console.log(mycoin.hashBlock('adfdsfsdf', 'asds', {asd: "asds"}))


// Use cors to avoid errors
app.use(cors())

// Use express.json to parse request data into json
app.use(express.json())



// Creating endpoints to show the current state of our blockchain
app.get('/', (req, res) => {
    res.json({
        note: "This is the homepage.",
        blockchain: mycoin
    })
})


// Create API endpoint to access the public key of the node
app.get('/ecc/publicKey', (req, res) => {
    res.json({
        source: currentNodeUrl,
        publicKey: ecc.getPublicKey()
    })
})


// Create API endpoints to broadcast a transaction
app.post('/transaction/broadcast', (req, res) => {
    const {recipient, amount} = req.body
    const transactionId = uuid().split('-').join('')
    // console.log(transactionId)
    const data = currentNodeUrl + recipient + amount + transactionId
    const signature = ecc.sign(data)

    const newTransaction = mycoin.createTransactionData(currentNodeUrl, recipient, amount, signature, transactionId)

    const requests = []
    mycoin.networkNodes.forEach(nodeUrl => {
        const requestOptions = {
            method: 'POST',
            url: nodeUrl + '/transaction/add',
            data: newTransaction
        }
        requests.push(axios(requestOptions))
    })

    Promise.allSettled(requests)
        .then(responses => console.log('Broadcast successful.'))
        .catch(err => console.log(`Error: Could not broadcast the transaction\n${err}`))
    
    mycoin.pendingData.push(newTransaction)
    return res.json({
        note: 'New Transaction Broadcasted successfully'
    })

})

app.post('/transaction/add', (req, res) => {
    const {sender, recipient, transactionId, amount, signature} = req.body
    const url = sender + '/ecc/publicKey'
    const data = sender + recipient + amount + transactionId

    axios.get(url)
        .then(response => {
            // Verify the transaction and add it to pending transactions
            const publicKey = response.data.publicKey
            const isVerified = ecc.verify(data, signature, publicKey)

            if(isVerified) {
                mycoin.pendingData.push(req.body)
                return res.json({
                    note: "Successfully added transaction."
                })
            }
            else {
                return res.json({
                    note: 'Invalid signatures.'
                })
            }
        })
        .catch(err => console.log(`Error: Could not get the public key\n${err}`))
})


// Creating routes to connect to the network
app.post('/connect', (req, res) => {
    const newNodeUrl = req.body.newNodeUrl

    const requests = []
    // Send this node to all other nodes
    mycoin.networkNodes.forEach(nodeUrl => {
        const requestOptions = {
            method: "POST",
            url: nodeUrl + '/connect/addNode',
            data: {
                newNodeUrl: newNodeUrl,
                source: currentNodeUrl
            }
        }
        requests.push(axios(requestOptions));
    });

    Promise.allSettled(requests)
        .then(responses => {
            // console.log("All nodes have added the new node")
        })
        .catch(err => console.log(`Error : ${err}`))

    mycoin.addNode(newNodeUrl)

    const requestOptions = {
        method: 'POST',
        url: newNodeUrl + '/connect/addAllNodes',
        data: {
            networkNodes: [currentNodeUrl, ...mycoin.networkNodes],
            source: currentNodeUrl
        }
    }

    axios(requestOptions)
        .then(response => {
            return res.json({
                note: 'Node added to network successfully',
            })
        })
        .catch(err => {
            console.log(`Error 2: ${err}`)
        })
})

app.post('/connect/addNode', (req, res) => {
    const newNodeUrl = req.body.newNodeUrl
    mycoin.addNode(newNodeUrl)

    res.json({
        note: "Node added successfully.",
        currentNodeUrl: currentNodeUrl
    })
})

app.post('/connect/addAllNodes', (req, res) => {
    const allNodes = req.body.networkNodes
    allNodes.forEach(nodeUrl => {
        mycoin.addNode(nodeUrl)
    })

    res.json({
        note: "Connected successfully"
    })
})


// Create new Block
app.get('/block/broadcast', (req, res) => {
    const newBlock = mycoin.createBlock()
    const message = {
        newBlock: newBlock,
        view: viewNumber,
        primary: currentNodeUrl
    }
    console.log('block created')

    blockToBeAdded = newBlock
    selfDigest = newBlock.hash

    const requests = []
    mycoin.networkNodes.forEach(nodeUrl => {
        const requestOptions = {
            method: 'POST',
            url: nodeUrl + '/preprepare',
            data: message
        }
        requests.push(axios(requestOptions))
    })

    Promise.allSettled(requests)

    res.json({note: 'Block broadcasted successfully.'})
})

app.post('/preprepare', (req, res) => {
    const {blockId, transactions, previousHash, hash} = req.body.newBlock
    console.log("In preprepare phase")
    const checkHash = mycoin.hashBlock(blockId, previousHash, transactions)
    
    // If the hashes dont match, the block is invalid
    if(checkHash !== hash) {
        return res.json({
            note: "This block is invalid",
            status: "FAIL",
            block: req.body.newBlock
        })
    }
    selfDigest = checkHash
    blockToBeAdded = req.body.newBlock

    const message = {
        digest: checkHash,
        primary: req.body.primary,
        view: req.body.view,
        sender: currentNodeUrl
    }
    const requests = []
    mycoin.networkNodes.forEach(nodeUrl => {
        const requestOptions = {
            method: 'POST',
            url: nodeUrl + '/prepare',
            data: message
        }
        requests.push(axios(requestOptions))
    })
    Promise.allSettled(requests)
        .then()
        .catch(err => {
            console.log('Error while sending prepare')
        })
    
    

    console.log("Recieved Block preprepare and sent prepare message")
    res.json({
        note: 'Received Block',
        status: 'SUCCESS'
    })
})


// Consensus mechanism
app.post('/prepare', (req, res) => {
    const {digest, view, primary, sender} = req.body
    
    if(digest === selfDigest && view === viewNumber) {
        prepareCount = prepareCount + 1
    }
    console.log(`In prepare phase - ${prepareCount} VIEW - ${viewNumber} SENDER - ${sender}`)

    const maxFaultyNodes = Math.floor((mycoin.networkNodes.length + 1)/3)
    if(prepareCount >= 2*maxFaultyNodes && prepareFinished === false) {
        // Now we can send the commit message
        console.log(`Starting commit phase --- VIEW - ${viewNumber}`)
        const message = {
            digest: digest,
            view: view, 
            primary: primary,
            sender: currentNodeUrl
        }

        const requests = []
        mycoin.networkNodes.forEach(nodeUrl => {
            const requestOptions = {
                method: 'POST',
                url: nodeUrl + '/commit',
                data: message
            }
            requests.push(axios(requestOptions))
            // axios(requestOptions)
            //     .catch(err => console.log(`Could not send data to ${nodeUrl}`))
        })
        Promise.allSettled(requests)
            .then()
            .catch(err => {
                console.log('Error while sending commit message')
            })
        prepareFinished = true
    }

})


app.post('/commit', (req, res) => {
    const {digest, view, primary, sender} = req.body
    
    if(digest === selfDigest && view === viewNumber) {
        commitCount = commitCount + 1
    }
    console.log(`In the commit phase - ${commitCount} VIEW - ${viewNumber}  SENDER - ${sender}`)
    const maxFaultyNodes = Math.floor((mycoin.networkNodes.length + 1)/3)
    if(commitCount >= 2*maxFaultyNodes) {
        mycoin.chain.push(blockToBeAdded)
        mycoin.pendingData = []
        // Reset the view details
        viewNumber = viewNumber + 1
        commitCount = 1
        prepareCount = 1
        selfDigest = ''
        blockToBeAdded = {}
        prepareFinished = false

        console.log('Block added. :-)')
        return res.json({
            note: "Block Added Successfully"  
        })
    }

    res.json({
        note: "Block Not Added"
    })
})







app.listen(port, () => {
    console.log(`Server running on port ${port}`);
})