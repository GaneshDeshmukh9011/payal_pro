import oqs

# Function to generate key pair for Dilithium
def generate_keypair(dilithium):
    public_key = dilithium.generate_keypair()
    private_key = dilithium.export_secret_key()
    print("Public Key Length:", len(public_key))
    print("Private Key Length:", len(private_key))
    return public_key, private_key

# Function to sign a message
def sign_message(dilithium, message):
    signature = dilithium.sign(message.encode())
    print("Signature Length:", len(signature))
    return signature

# Function to verify signature
def verify_signature(dilithium, public_key, message, signature):
    try:
        # Convert inputs explicitly if necessary
        public_key = bytes(public_key)
        signature = bytes(signature)
        message_bytes = message.encode()

        # Perform verification
        is_valid = dilithium.verify(message_bytes, signature, public_key)
        return is_valid
    except Exception as e:
        print("Verification Error:", str(e))
        print("Message (bytes):", message_bytes)
        print("Signature (bytes):", signature)
        print("Public Key (bytes):", public_key)
        return False


# Main demonstration function
def digital_signature_demo():
    # Initialize Dilithium instance (try smaller parameter sets if needed)
    dilithium = oqs.Signature("Dilithium2")

    # Generate keys
    public_key, private_key = generate_keypair(dilithium)

    # Message to sign
    message = "Hello, this is a test message for digital signature!oihiuohiofuhffffffffffffffff jkkjieubfbbbbbbbbbbbbbbbbbb ghuidddddddddddddddd"
    print(f"Original Message: {message}")

    # Sign the message
    signature = sign_message(dilithium, message)

    # Verify the signature
    is_valid = verify_signature(dilithium, public_key, message, signature)
    print("Is the signature valid?", "Yes" if is_valid else "No")

# Run demonstration
digital_signature_demo()
