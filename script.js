// ====================================
// CONFIGURACIÓN
// ====================================
const WHATSAPP_NUMBER = "584120719505"; // Reemplaza con tu número de WhatsApp real (con código de país)
const DELIVERY_RATE_PER_KM = 1.00; // Costo por kilómetro
const MINIMUM_DELIVERY_FEE = 1.00; // Tarifa mínima de delivery si se activa

// Ubicación de la tienda (ejemplo en Maracaibo, Venezuela)
const SHOP_LAT = 10.6300; // Latitud de tu negocio
const SHOP_LON = -71.7450; // Longitud de tu negocio

// ====================================
// LÓGICA DEL CARRITO Y PEDIDO
// ====================================
let cart = []; 
let total = 0;
let deliveryFee = 0;
let userLocation = null;

/**
 * Agrega un producto al carrito, capturando las opciones de personalización (checkboxes y notas).
 */
function addItemWithDetails(name, price, itemElement) {
    let details = [];
    
    // 1. Recoger opciones de Checkbox
    const checkboxes = itemElement.querySelectorAll('.opciones-grupo input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.checked) {
            details.push(cb.value);
        }
    });

    // 2. Recoger notas de la caja de texto
    const notesBox = itemElement.querySelector('.instrucciones-box');
    const notes = notesBox ? notesBox.value.trim() : '';
    
    if (notes) {
        details.push(`Nota: ${notes}`);
    }

    // 3. Crear el nombre completo del producto
    const itemDetails = details.length > 0 ? ` (${details.join(', ')})` : '';
    const itemName = name + itemDetails;

    // 4. Agregar al carrito
    cart.push({ name: itemName, price: price, basePrice: price }); 
    
    // 5. Limpiar y resetear UI
    if (notesBox) {
        notesBox.value = '';
        checkboxes.forEach(cb => {
            if (cb.getAttribute('data-default-checked') === 'true') {
                cb.checked = true;
            } else {
                cb.checked = false;
            }
        });
    }

    // 6. Actualizar el display
    updateCartDisplay();
    // alert(`✅ Añadido: ${name}. Total de items: ${cart.length}`); // Descomentar para debug
}

function updateCartDisplay() {
    const totalElement = document.getElementById('cart-total-price');
    const checkoutBtn = document.getElementById('checkout-btn');
    const deliveryCheckbox = document.getElementById('delivery-checkbox');

    let subtotal = cart.reduce((sum, item) => sum + item.basePrice, 0);
    
    deliveryFee = 0;
    if (deliveryCheckbox.checked) {
        if (userLocation) {
            const distance = calculateDistance(SHOP_LAT, SHOP_LON, userLocation.latitude, userLocation.longitude);
            deliveryFee = Math.max(MINIMUM_DELIVERY_FEE, distance * DELIVERY_RATE_PER_KM);
            
            document.getElementById('delivery-details').innerHTML = 
                `Costo de delivery: **${deliveryFee.toFixed(2)}$** (${distance.toFixed(1)} km aprox.)`;
        } else {
            deliveryFee = MINIMUM_DELIVERY_FEE;
            document.getElementById('delivery-details').textContent = 
                `Costo de delivery: **${deliveryFee.toFixed(2)}$** (Tarifa mínima - Pendiente cálculo exacto)`;
        }
    } else {
        document.getElementById('delivery-details').textContent = 
            `Seleccione Delivery para calcular el costo. (1$ por km, mínimo 1$)`;
    }

    total = subtotal + deliveryFee;
    totalElement.textContent = total.toFixed(2);
    
    if (cart.length > 0) {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = `Hacer Pedido (${cart.length} productos) - ${total.toFixed(2)}$`;
    } else {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = `Hacer Pedido por WhatsApp`;
    }
}

function checkAndSendOrder() {
    if (cart.length === 0) {
        alert("Tu carrito está vacío.");
        return;
    }

    const deliveryCheckbox = document.getElementById('delivery-checkbox');
    if (deliveryCheckbox.checked && !userLocation) {
        alert("Por favor, espere mientras calculamos el delivery o desactive la opción.");
        getLocation(); 
        return;
    }

    sendWhatsAppOrder();
}

// Genera y abre el enlace de WhatsApp
function sendWhatsAppOrder() {
    const deliveryCheckbox = document.getElementById('delivery-checkbox');
    let message = `¡Hola Pa que Wainer! Mi pedido es:\n\n`;

    cart.forEach((item, index) => {
        message += `${index + 1}. ${item.name} - ${item.basePrice.toFixed(2)}$\n`;
    });

    const subtotal = cart.reduce((sum, item) => sum + item.basePrice, 0);
    message += `\n---`;
    message += `\n🛒 Subtotal: ${subtotal.toFixed(2)}$`;

    if (deliveryCheckbox.checked) {
        message += `\n🚚 Costo Delivery: ${deliveryFee.toFixed(2)}$`;
        if (userLocation) {
            message += ` (Ubicación GPS adjunta)`;
        }
    } else {
        message += `\nRecogeré en tienda.`;
    }

    message += `\n💰 **TOTAL FINAL: ${total.toFixed(2)}$**`;
    message += `\n\n*Por favor, confirma mi pedido y el método de pago.*`;

    let whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

    // Adjuntar la ubicación GPS para que WhatsApp la reconozca como un mapa
    if (userLocation && deliveryCheckbox.checked) {
        // La URL de Google Maps para un punto (lat, lon)
        const mapLink = `http://maps.google.com/?q=${userLocation.latitude},${userLocation.longitude}`;
        // Se añade como un texto separado para que WhatsApp lo convierta en un pin
        whatsappLink += encodeURIComponent(`\n\nMi Ubicación GPS para el Delivery:\n${mapLink}`); 
    }

    window.open(whatsappLink, '_blank');
}

// ====================================
// LÓGICA DE CARGA DINÁMICA DEL MENÚ
// ====================================

async function fetchMenuData() {
    try {
        const response = await fetch('menu_data.json');
        if (!response.ok) {
            // Este es el error más común: archivo no encontrado (404) o CORS (si lo pruebas localmente)
            throw new Error(`Error ${response.status} al cargar menu_data.json. Asegúrate que el archivo exista.`);
        }
        const menuData = await response.json();
        renderMenu(menuData);
    } catch (error) {
        console.error("Error al cargar el menú:", error);
        document.getElementById('menu-content-container').innerHTML = 
            '<p style="color: red; text-align: center;">⚠️ Error cargando el menú. Revisa la consola y el archivo menu_data.json.</p>';
    }
}

function renderMenu(menuData) {
    const menuContainer = document.getElementById('menu-content-container');
    let menuHTML = '';

    menuData.forEach(category => {
        let itemsHTML = '';
        category.items.forEach(item => {
            
            // --- Generar Opciones (Checkboxes) si existen ---
            let optionsHTML = '';
            if (item.options) {
                optionsHTML += '<h3 class="opciones-titulo">Personaliza tu ' + item.name + ':</h3>';
                optionsHTML += '<div class="opciones-grupo">';
                item.options.forEach(option => {
                    const isChecked = option.checked ? 'checked' : '';
                    const defaultAttr = option.checked ? 'data-default-checked="true"' : '';
                    optionsHTML += `
                        <label>
                            <input type="checkbox" value="${option.value}" ${isChecked} ${defaultAttr}> 
                            ${option.label}
                        </label>`;
                });
                optionsHTML += '</div>';
            }

            // --- Generar el HTML del Item ---
            itemsHTML += `
                <div class="menu-item-complex" data-name="${item.name}" data-price="${item.price}">
                    <div class="item-header">
                        <span class="item-title">${item.name}</span>
                        <span class="price">${item.price.toFixed(2)}$</span>
                    </div>
                    ${optionsHTML}
                    <textarea placeholder="Instrucciones Especiales: (Ej: Poco queso, sin lechuga)" rows="2" class="instrucciones-box"></textarea>
                    <button class="add-to-cart-btn full-width" onclick="addItemWithDetails('${item.name}', ${item.price}, this.parentNode)">
                        Añadir ${item.name} al Pedido
                    </button>
                </div>
            `;
        });

        // --- Generar la Sección de la Categoría ---
        menuHTML += `
            <section class="menu-category">
                <h2>${category.category}</h2>
                <p class="slogan">${category.slogan}</p>
                <div class="menu-item-list">
                    ${itemsHTML}
                </div>
            </section>
        `;
    });

    menuContainer.innerHTML = menuHTML;
}

// ====================================
// LÓGICA DE UBICACIÓN Y DISTANCIA
// ====================================

function getLocation() {
    if (navigator.geolocation) {
        document.getElementById('loading-location').style.display = 'block';
        document.getElementById('delivery-details').textContent = 'Calculando delivery...';

        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = position.coords;
                document.getElementById('loading-location').style.display = 'none';
                updateCartDisplay(); 
            },
            error => {
                document.getElementById('loading-location').style.display = 'none';
                document.getElementById('delivery-details').textContent = '⚠️ Permiso de ubicación denegado. Se usará la tarifa mínima.';
                userLocation = null;
                updateCartDisplay(); 
                console.error("Error al obtener la ubicación:", error);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    } else {
        document.getElementById('delivery-details').textContent = 'Geolocation no es soportada por este navegador.';
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distancia en km
}

// ====================================
// INICIALIZACIÓN
// ====================================

document.getElementById('delivery-checkbox').addEventListener('change', (event) => {
    if (event.target.checked) {
        getLocation(); 
    }
    updateCartDisplay();
});

window.onload = function() {
    fetchMenuData(); // Llama a la carga dinámica del menú
    updateCartDisplay();

    document.getElementById('promo-container').textContent = '¡2x1 en Arepas Tradicionales!';
    document.getElementById('schedule-container').textContent = 'Abierto de 5:00 PM a 1:00 AM';
};

