import {Protocol} from "trac-peer";
import fs from 'fs/promises'; 
import path from 'path';

class FileExchangeProtocol extends Protocol{
    constructor(peer, base, options = {}) {
        super(peer, base, options);
    }

    txMaxBytes(){ return 2_048; }

    mapTxCommand(command){
        let obj = { type : '', value : null };
        const json = command;
        if(json.op !== undefined){
            switch(json.op){
                case 'init_file_upload':
                case 'upload_file_chunk':
                case 'transfer_file':
                    obj.type = json.op;
                    obj.value = json;
                    break;
            }
            if(null !== obj.value) return obj;
        }
        return null;
    }

    async printOptions(){
        console.log(' ');
        console.log('- File Exchange Command List:');
        console.log("- /claim | Mints a file from the collection and transfers it: '/claim --file <filename.png> --to <address>'");
        console.log("- /upload_file | Uploads a file (for admin/API use): '/upload_file --path <absolute_filepath>'");
        console.log("- /get_file_meta | Get metadata for a file: '/get_file_meta --file_id <id>'");
        console.log("- /my_files | Lists all files owned by you.");
        console.log("- /transfer_file | Transfers a file you own: '/transfer_file --file_id <id> --to <address>'");
    }

        // MEJORA: Lógica de transacción híbrida: rápida pero con reintentos inteligentes.
    async _transact(command, args, retries = 3) {
        let lastError = null;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Actualizar el estado del peer antes de CADA intento es crucial para resolver
                // errores de firma (INVALID_SIGNATURE) causados por desfases de estado.
                if (attempt > 1) {
                    console.warn(`[PROTOCOL] Retrying transaction, attempt ${attempt}/${retries}...`);
                    await this.peer.base.update();
                }

                const res = await this.peer.protocol_instance.tx({ command: command }, {});
                
                // La transacción se envió, pero debemos verificar si el peer la procesó con error.
                if (res !== false) {
                    const err = this.peer.protocol_instance.getError(res);
                    if (err) {
                        // Un error conocido, como "Not owner", no debería reintentarse.
                        // Pero un error de firma sí.
                        if (err.message.includes('INVALID_SIGNATURE') && attempt < retries) {
                           console.warn(`[PROTOCOL] Signature error detected. Retrying after a short delay...`);
                           lastError = new Error(err.message);
                           await new Promise(resolve => setTimeout(resolve, 1500 * attempt)); // Backoff lineal
                           continue; // Forzar el siguiente intento del bucle
                        }
                        // Para otros errores de la lógica del protocolo, fallamos inmediatamente.
                        throw new Error(err.message);
                    }
                    // Si no hay error, la transacción fue exitosa.
                    return; 
                } else {
                    // res es 'false' puede indicar un fallo de red antes de que la tx llegara al peer.
                    // Vale la pena reintentar.
                    throw new Error('Transaction failed to be processed by the peer (returned false).');
                }

            } catch (error) {
                lastError = error;
                // Si el bucle termina, lanzaremos el último error capturado.
                if (attempt >= retries) {
                    break;
                }
            }
        }
        // Si salimos del bucle (por agotar reintentos), lanzamos el error final.
        throw new Error(`Transaction failed after ${retries} attempts. Last error: ${lastError.message}`);
    }
    
    // MEJORA: Timeout más inteligente con backoff y fallando más rápido.
    async waitForStateUpdate(key, checkFn, timeout = 30000) {
        const start = Date.now();
        let delay = 1000; // Empezamos con un delay de 1 segundo
        const maxDelay = 5000; // No esperamos más de 5 segundos entre chequeos

        while (Date.now() - start < timeout) {
            // Actualizamos estado y comprobamos.
            await this.peer.base.update();
            const value = await this.get(key);
            if (value !== null && checkFn(value)) {
                // ¡Éxito! El estado se ha actualizado.
                return value;
            }

            // Esperamos antes del siguiente chequeo.
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Aumentamos el delay para el siguiente intento (backoff exponencial suave).
            // Esto evita saturar la red si el estado tarda en propagarse.
            delay = Math.min(delay * 1.5, maxDelay);
        }

        // Si el tiempo se agota, lanzamos un error claro.
        throw new Error(`[PROTOCOL] State update timed out for key: ${key.substring(0, 60)}... after ${timeout / 1000}s`);
    }

    // MEJORA: Mantenemos la validación de archivo del código complejo.
    async validateFile(filePath) {
        try {
            const stats = await fs.stat(filePath);
            if (stats.size === 0) throw new Error('File is empty');
            if (stats.size > 10 * 1024 * 1024) throw new Error('File is too large (max 10MB)');
            return true;
        } catch (error) {
            throw new Error(`File validation failed for ${path.basename(filePath)}: ${error.message}`);
        }
    }

    // LÓGICA DE SUBIDA RÁPIDA Y EFICIENTE (Basada en el backup)
    async uploadSingleFile(filePath) {
        console.log(`\n--- Starting upload for: ${path.basename(filePath)} ---`);
        
        await this.validateFile(filePath);
        
        const fileBuffer = await fs.readFile(filePath);
        const filename = path.basename(filePath);
        const file_id = await this.peer.createHash('sha256', fileBuffer);
        const metadataKey = 'file_meta/' + file_id;

        await this.peer.base.update();
        const existing_metadata = await this.get(metadataKey);
        if (existing_metadata) {
            console.log(`[PROTOCOL] File ${filename} already minted. Returning existing metadata.`);
            return { file_id, status: 'existing', metadata: existing_metadata };
        }
        
        // Mantenemos el tamaño de chunk de 768 bytes para un rendimiento óptimo.
        const chunkSize = 768;
        const total_chunks = Math.ceil(fileBuffer.length / chunkSize);

        const initCommand = { op: 'init_file_upload', file_id, filename, mime_type: 'image/png', total_chunks, file_hash: file_id };
        await this._transact(initCommand, {});
        const new_metadata = await this.waitForStateUpdate(metadataKey, (value) => value !== null);

        for (let i = 0; i < total_chunks; i++) {
            const chunkData = fileBuffer.toString('base64', i * chunkSize, (i + 1) * chunkSize);
            const chunkKey = `file_chunk/${file_id}/${i}`;
            const chunkCommand = { op: 'upload_file_chunk', file_id, chunk_index: i, chunk_data: chunkData };
            await this._transact(chunkCommand, {});
            await this.waitForStateUpdate(chunkKey, (value) => value !== null);
        }
        
        console.log(`[PROTOCOL] Upload for ${filename} completed successfully.`);
        return { file_id, status: 'minted', metadata: new_metadata };
    }

    async transferSingleFile(file_id, to_address) {
        await this.peer.base.update();
        const metadata = await this.get('file_meta/' + file_id);

        if (!metadata) throw new Error(`File with ID ${file_id} not found.`);

        const currentOwner = metadata.owner;
        const requestorAddress = this.peer.wallet.publicKey;

        if (currentOwner.toLowerCase() !== requestorAddress.toLowerCase()) {
            throw new Error(`You are not the owner of this file. Only the owner (${currentOwner}) can transfer it.`);
        }
        if (requestorAddress.toLowerCase() === to_address.toLowerCase()) {
            throw new Error("Cannot transfer file to yourself.");
        }

        const command = { op: 'transfer_file', file_id, to_address };
        await this._transact(command, {});
    }
    
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
    
    // MEJORA: Mantenemos la búsqueda de archivo del código complejo.
    async findFile(baseDir, filename) {
        const fullPath = path.join(baseDir, filename);
        if (await this.fileExists(fullPath)) {
            return fullPath;
        }
        throw new Error(`File not found at exact path: ${fullPath}`);
    }

    async customCommand(input) {
        try {
            if (input.startsWith("/claim")) {
                const args = this.parseArgs(input);
                if (!args.file) throw new Error("Please specify a filename from the collection using --file");
                if (!args.to) throw new Error("Please specify a recipient address using --to");

                const collectionDir = path.join(process.cwd(), 'public', 'coleccion');
                const filePath = await this.findFile(collectionDir, args.file);
                
                const { file_id, metadata } = await this.uploadSingleFile(filePath);

                const currentOwner = metadata.owner;
                const minterAddress = this.peer.wallet.publicKey;

                if (currentOwner.toLowerCase() === args.to.trim().toLowerCase()) {
                    return { file_id, status: 'already_owned' };
                }
                if (currentOwner.toLowerCase() !== minterAddress.toLowerCase()) {
                    throw new Error(`Cannot transfer. This NFT is already owned by another user: ${currentOwner}`);
                }
                
                await this.transferSingleFile(file_id, args.to.trim());
                const metadataKey = 'file_meta/' + file_id;
                await this.waitForStateUpdate(metadataKey, (value) => value && value.owner.toLowerCase() === args.to.trim().toLowerCase());
                
                return { file_id, status: 'transferred' };

            } else if (input.startsWith("/upload_file")) {
                const args = this.parseArgs(input);
                if (!args.path) throw new Error('Please specify an absolute file path using --path');
                return await this.uploadSingleFile(args.path);
            } 
            // ... (el resto de los comandos como get_file_meta, my_files, transfer_file)
            else if (input.startsWith("/get_file_meta")) {
                const args = this.parseArgs(input);
                if (!args.file_id) throw new Error('Please specify file_id using --file_id');
                await this.peer.base.update();
                const metadata = await this.get('file_meta/' + args.file_id);
                console.log(metadata || "Metadata not found.");
                return metadata;
            } else if (input.startsWith("/my_files")) {
                await this.peer.base.update();
                const myPublicKey = this.peer.wallet.publicKey;
                const ownerFilesKey = 'owner_files/' + myPublicKey;
                const myFileIds = await this.get(ownerFilesKey) || [];
                const myFiles = [];
                if (myFileIds.length > 0) {
                    for (const file_id of myFileIds) {
                        const metadata = await this.get('file_meta/' + file_id);
                        if (metadata) {
                             myFiles.push({ filename: metadata.filename, file_id: file_id });
                        }
                    }
                }
                console.log(`You own ${myFiles.length} file(s):`);
                console.table(myFiles);
                return myFiles;
            } else if (input.startsWith("/transfer_file")) {
                const args = this.parseArgs(input);
                if (!args.file_id) throw new Error("Please specify a file ID using --file_id");
                if (!args.to) throw new Error("Please specify a recipient address using --to");
                await this.transferSingleFile(args.file_id, args.to);
                const metadataKey = 'file_meta/' + args.file_id;
                await this.waitForStateUpdate(metadataKey, (value) => value && value.owner.toLowerCase() === args.to.toLowerCase());
                return { file_id: args.file_id, status: 'transferred' };
            }

        } catch (e) {
            console.error(`\n!!! COMMAND FAILED: ${e.message} !!!`);
            throw e; 
        }
    }
}

export default FileExchangeProtocol;